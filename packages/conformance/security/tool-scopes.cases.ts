import type { Case } from '../support/case';

/**
 * Authorization per agent, on every door at once.
 *
 * Identity (Web Bot Auth) says *who* is calling; a scope says *what that
 * caller may do*. The claim these rows defend is the one SECURITY.md used to
 * list as an open area — "tools/resources visible to a context that should not
 * see them" — and it has two halves that must hold together: an out-of-scope
 * tool is **absent** from what the caller is told exists, and **refused** when
 * it is called anyway. Either one alone is a bug: an invisible tool whose HTTP
 * endpoint still runs is security by obscurity, and a refusal that still
 * advertises the tool hands an agent the name, the description and the input
 * schema of something it may never call.
 *
 * So every row runs one grant against one door, and the doors are the three an
 * agent actually has — the page manifest, the in-page bridge and the HTTP
 * invocation endpoint — plus the hosted MCP listing, which is the same
 * question asked by an external client.
 *
 * The grant model under test: `ctx.scopes` is what the credential carries and
 * `ctx.agent.scopes` is how much of it the agent may spend, so the effective
 * grant is the intersection and an agent can never out-rank its user.
 *
 * Sources: RFC 6749 §3.3 (scope as a *narrowing* of the resource owner's
 * authority); OWASP ASVS V4.1.3 (enforce access control at a trusted service
 * layer, never on the client).
 */
export interface ToolScopeCase {
  /** Which door the caller knocks on. */
  via: 'manifest' | 'mcp' | 'bridge' | 'http';
  /** What the session cookie grants — the credential's own authority. */
  session: string[];
  /** The signing agent's grant. Absent ⇒ no agent: the session acts for itself. */
  agent?: string[];
  expected: string[];
}

export type ToolScopeRow = Case<ToolScopeCase>;

/** Everything the fixture app declares, for the rows where nothing is filtered. */
const ALL_APIS = 'tools:api.orders.list,api.orders.refund,api.orders.status';
const READ_ONLY_APIS = 'tools:api.orders.list,api.orders.status';
const FULL = ['orders:read', 'orders:write'];
const READ = ['orders:read'];
/** What the HTTP endpoint answers for a tool outside the grant: a refusal, with a status to match. */
const REFUSED = '403 Error: Tool "orders.refund" is not available';

export const TOOL_SCOPE_CASES: ToolScopeRow[] = [
  {
    id: 'security-scope-the-manifest-an-agent-reads-holds-only-what-it-may-spend',
    src: 'janux',
    via: 'manifest',
    session: FULL,
    agent: READ,
    expected: [READ_ONLY_APIS],
  },
  {
    id: 'security-scope-the-same-manifest-is-whole-for-the-user-behind-that-agent',
    src: 'janux',
    via: 'manifest',
    session: FULL,
    expected: [ALL_APIS],
  },
  {
    id: 'security-scope-an-agent-cannot-exceed-the-session-it-acts-for',
    src: 'janux',
    via: 'manifest',
    session: READ,
    agent: FULL,
    expected: [READ_ONLY_APIS],
  },
  {
    id: 'security-scope-the-hosted-mcp-listing-narrows-with-the-same-answer',
    src: 'janux',
    via: 'mcp',
    session: FULL,
    agent: READ,
    expected: ['tools:orders.list,orders.status'],
  },
  {
    /**
     * The transport cannot opt out. Both invocations are the same call with a
     * different claim about who is making it — `x-janux-origin` is free to
     * type, so a scope that only bound agents would be one header away from
     * nothing.
     */
    id: 'security-scope-an-out-of-scope-tool-is-refused-over-http-however-the-caller-signs-itself',
    src: 'janux',
    via: 'http',
    session: FULL,
    agent: READ,
    expected: [`refund/agent:${REFUSED}`, `refund/human:${REFUSED}`, 'list/agent:200 LISTED', 'status/agent:200 STATUS'],
  },
  {
    /** No agent in sight: a session that was never granted the scope is refused too. */
    id: 'security-scope-a-session-without-the-grant-is-refused-with-no-agent-involved',
    src: 'janux',
    via: 'http',
    session: READ,
    expected: [`refund/agent:${REFUSED}`, `refund/human:${REFUSED}`, 'list/agent:200 LISTED', 'status/agent:200 STATUS'],
  },
  {
    id: 'security-scope-a-fully-granted-session-still-refunds',
    src: 'janux',
    via: 'http',
    session: FULL,
    expected: [
      'refund/agent:200 REFUNDED',
      'refund/human:200 REFUNDED',
      'list/agent:200 LISTED',
      'status/agent:200 STATUS',
    ],
  },
  {
    id: 'security-scope-the-bridge-neither-lists-nor-runs-an-out-of-scope-intent',
    src: 'janux',
    via: 'bridge',
    session: FULL,
    agent: READ,
    expected: ['view:VIEWED', 'tools:cart.view', 'empty:threw:Intent "cart.empty" is not available'],
  },
  {
    id: 'security-scope-the-bridge-runs-both-when-the-grant-covers-both',
    src: 'janux',
    via: 'bridge',
    session: FULL,
    expected: ['view:VIEWED', 'tools:cart.empty,cart.view', 'empty:EMPTIED'],
  },
];
