import type { Case } from '../support/case';

/**
 * `/_janux/api/*` and the two endpoints that settle what it proposes, as HTTP.
 *
 * The pipeline's decisions only matter if the wire says the same thing: a client
 * branches on the status, a copilot branches on `ok`, and an operator greps the
 * error string. So every row here is a request and the exact envelope it must come
 * back with — status, and body verbatim.
 *
 * The proposal endpoints are stateful, which is the interesting part: a proposal
 * is single-use, an agent may not settle its own, a rejected one cannot be
 * approved afterwards, and the id is a UUID precisely because the map is
 * server-wide and a guessable id would let any caller approve someone else's
 * `confirm`.
 *
 * Sources: janux server.ts (`handleApi`, `handleApprove`, `/_janux/reject`) and
 * http.ts (`errorStatus`, `proposalId`).
 */
export interface HttpCase {
  /** The steps this row performs against one fresh server, in order. */
  steps: Step[];
  /** One `status body` line per step, plus any `side:` lines the run recorded. */
  expected: string[];
}

export interface Step {
  /** Path under the server's origin. */
  path: string;
  method?: string;
  /** Body text sent verbatim; absent ⇒ no body at all. */
  body?: string;
  /** Extra headers on top of same-origin JSON ones. */
  headers?: Record<string, string>;
  /** Substitutes `{id}` in `body` with the id the previous proposal returned. */
  withProposalId?: boolean;
  /** Record what the app did (its side-effect log) after this step. */
  recordEffects?: boolean;
}

export type HttpRow = Case<HttpCase>;

const AGENT = { 'x-janux-origin': 'agent' };
const post = (path: string, body = '{}', headers?: Record<string, string>): Step => ({ path, body, headers });

/** `POST /_janux/api/shop.<name>` as the page (human) or as a self-declared agent. */
const callApi = (name: string, body = '{}', headers?: Record<string, string>): Step =>
  post(`/_janux/api/shop.${name}`, body, headers);

const ok = (result: string) => `200 {"ok":true,"result":${result}}`;
const failed = (status: number, error: string) => `${status} ${JSON.stringify({ ok: false, error })}`;

export const HTTP_CASES: HttpRow[] = [
  // ── the ordinary call ───────────────────────────────────────────────────────
  {
    id: 'rpc-http-a-call-answers-with-the-result-envelope',
    src: 'janux',
    steps: [callApi('read', '{"q":"hello"}')],
    expected: [ok('{"q":"hello"}')],
  },
  {
    id: 'rpc-http-the-response-is-json',
    src: 'janux',
    steps: [{ ...callApi('read'), recordEffects: false }],
    expected: [ok('{"q":"all"}')],
  },
  {
    id: 'rpc-http-an-unknown-tool-is-a-404',
    src: 'janux',
    steps: [callApi('nope')],
    expected: [failed(404, 'Unknown api "shop.nope"')],
  },
  {
    id: 'rpc-http-an-unknown-namespace-is-a-404',
    src: 'janux',
    steps: [post('/_janux/api/billing.read')],
    expected: [failed(404, 'Unknown api "billing.read"')],
  },
  {
    id: 'rpc-http-an-empty-tool-name-is-a-404',
    src: 'janux',
    steps: [post('/_janux/api/')],
    expected: [failed(404, 'Unknown api ""')],
  },
  {
    id: 'rpc-http-a-trailing-slash-is-part-of-the-name-and-finds-nothing',
    src: 'janux',
    steps: [post('/_janux/api/shop.read/')],
    expected: [failed(404, 'Unknown api "shop.read/"')],
  },
  {
    id: 'rpc-http-a-percent-encoded-name-is-not-decoded-into-a-match',
    src: 'janux',
    steps: [post('/_janux/api/shop%2Eread')],
    expected: [failed(404, 'Unknown api "shop%2Eread"')],
  },
  {
    id: 'rpc-http-the-api-prefix-is-matched-with-its-namespace-separator',
    src: 'janux',
    steps: [post('/_janux/apishop.read')],
    expected: ['404 page'],
  },
  {
    id: 'rpc-http-invalid-input-is-a-400-with-the-field-that-broke',
    src: 'janux',
    steps: [callApi('read', '{"q":123}')],
    expected: [failed(400, 'Error: Invalid input for "shop.read" — q: expected string')],
  },
  {
    id: 'rpc-http-a-throwing-tool-is-a-500-and-does-not-leak-a-stack',
    src: 'janux',
    steps: [callApi('boom')],
    expected: [failed(500, 'Error: kaboom')],
  },
  {
    id: 'rpc-http-an-invalid-output-is-a-500-not-a-400',
    src: 'janux',
    steps: [callApi('badOutput')],
    expected: [failed(500, 'Error: Janux: api "shop.badOutput" returned an invalid output')],
  },
  {
    id: 'rpc-http-a-malformed-body-is-treated-as-an-empty-one',
    src: 'janux',
    steps: [callApi('read', '{not json')],
    expected: [ok('{"q":"all"}')],
  },
  {
    id: 'rpc-http-no-body-at-all-is-treated-as-an-empty-one',
    src: 'janux',
    steps: [{ path: '/_janux/api/shop.read', method: 'POST' }],
    expected: [ok('{"q":"all"}')],
  },
  {
    id: 'rpc-http-a-text-content-type-does-not-stop-the-body-being-read-as-json',
    src: 'janux',
    steps: [callApi('read', '{"q":"typed wrong"}', { 'content-type': 'text/plain' })],
    expected: [ok('{"q":"typed wrong"}')],
  },

  // ── who is calling ──────────────────────────────────────────────────────────
  {
    id: 'rpc-http-a-forbidden-tool-still-serves-the-page',
    src: 'janux',
    steps: [callApi('closed')],
    expected: [ok('"secret"')],
  },
  {
    id: 'rpc-http-a-forbidden-tool-refuses-a-self-declared-agent-with-403',
    src: 'janux',
    steps: [callApi('closed', '{}', AGENT)],
    expected: [failed(403, 'Error: Tool "shop.closed" is not available')],
  },
  {
    id: 'rpc-http-the-origin-header-value-is-matched-exactly',
    src: 'janux',
    steps: [callApi('closed', '{}', { 'x-janux-origin': 'AGENT' })],
    expected: [ok('"secret"')],
  },
  {
    id: 'rpc-http-an-unknown-origin-header-value-is-a-human',
    src: 'janux',
    steps: [callApi('closed', '{}', { 'x-janux-origin': 'robot' })],
    expected: [ok('"secret"')],
  },

  // ── confirm: propose, then settle ───────────────────────────────────────────
  {
    id: 'rpc-http-a-confirm-tool-run-by-a-human-just-runs',
    src: 'janux',
    steps: [{ ...callApi('refund'), recordEffects: true }],
    expected: [ok('"refunded"'), 'side:refund'],
  },
  {
    id: 'rpc-http-a-confirm-tool-asked-for-by-an-agent-becomes-a-proposal-and-does-not-run',
    src: 'janux',
    steps: [{ ...callApi('refund', '{}', AGENT), recordEffects: true }],
    expected: ['200 {"ok":true,"result":{"status":"proposal","id":"<id>","tool":"shop.refund","input":{}}}', 'side:'],
  },
  {
    id: 'rpc-http-a-proposal-validates-its-input-before-parking-it',
    src: 'janux',
    steps: [post('/_janux/api/shop.transfer', '{"amount":"lots"}', AGENT)],
    expected: [failed(400, 'Error: Invalid input for "shop.transfer" — amount: expected int')],
  },
  {
    id: 'rpc-http-approving-a-proposal-runs-the-tool',
    src: 'janux',
    steps: [
      callApi('refund', '{}', AGENT),
      { ...post('/_janux/approve', '{"id":"{id}"}'), withProposalId: true, recordEffects: true },
    ],
    expected: ['200 <proposal>', ok('"refunded"'), 'side:refund'],
  },
  {
    id: 'rpc-http-a-proposal-can-only-be-approved-once',
    src: 'janux',
    steps: [
      callApi('refund', '{}', AGENT),
      { ...post('/_janux/approve', '{"id":"{id}"}'), withProposalId: true },
      { ...post('/_janux/approve', '{"id":"{id}"}'), withProposalId: true, recordEffects: true },
    ],
    expected: ['200 <proposal>', ok('"refunded"'), failed(404, 'unknown proposal'), 'side:refund'],
  },
  {
    id: 'rpc-http-an-agent-may-not-approve-its-own-proposal',
    src: 'janux',
    steps: [
      callApi('refund', '{}', AGENT),
      { ...post('/_janux/approve', '{"id":"{id}"}', AGENT), withProposalId: true, recordEffects: true },
    ],
    expected: ['200 <proposal>', failed(403, 'a proposal is settled by a human, not by an agent'), 'side:'],
  },
  {
    id: 'rpc-http-an-agent-may-not-reject-a-proposal-either',
    src: 'janux',
    steps: [
      callApi('refund', '{}', AGENT),
      { ...post('/_janux/reject', '{"id":"{id}"}', AGENT), withProposalId: true },
      { ...post('/_janux/approve', '{"id":"{id}"}'), withProposalId: true, recordEffects: true },
    ],
    expected: [
      '200 <proposal>',
      failed(403, 'a proposal is settled by a human, not by an agent'),
      ok('"refunded"'),
      'side:refund',
    ],
  },
  {
    id: 'rpc-http-rejecting-a-proposal-makes-it-unapprovable',
    src: 'janux',
    steps: [
      callApi('refund', '{}', AGENT),
      { ...post('/_janux/reject', '{"id":"{id}"}'), withProposalId: true },
      { ...post('/_janux/approve', '{"id":"{id}"}'), withProposalId: true, recordEffects: true },
    ],
    expected: ['200 <proposal>', '200 {"ok":true}', failed(404, 'unknown proposal'), 'side:'],
  },
  {
    id: 'rpc-http-approving-an-unknown-id-is-a-404',
    src: 'janux',
    steps: [post('/_janux/approve', '{"id":"prop_api_00000000-0000-4000-8000-000000000000"}')],
    expected: [failed(404, 'unknown proposal')],
  },
  {
    id: 'rpc-http-approving-with-no-id-is-a-404',
    src: 'janux',
    steps: [post('/_janux/approve', '{}')],
    expected: [failed(404, 'unknown proposal')],
  },
  {
    id: 'rpc-http-approving-with-a-malformed-body-is-a-404',
    src: 'janux',
    steps: [post('/_janux/approve', 'not json')],
    expected: [failed(404, 'unknown proposal')],
  },
  {
    id: 'rpc-http-approving-with-a-non-string-id-is-a-404',
    src: 'janux',
    steps: [post('/_janux/approve', '{"id":{"toString":"nope"}}')],
    expected: [failed(404, 'unknown proposal')],
  },
  {
    // `{}` is not a proposal id, but a `Map` lookup with a crafted key would be a
    // way to find out — the answer must be the same 404 as for anything else.
    id: 'rpc-http-approving-with-a-prototype-key-is-a-404',
    src: 'janux',
    steps: [post('/_janux/approve', '{"id":"__proto__"}')],
    expected: [failed(404, 'unknown proposal')],
  },
  {
    id: 'rpc-http-rejecting-an-unknown-id-says-nothing-was-rejected',
    src: 'janux',
    steps: [post('/_janux/reject', '{"id":"prop_api_00000000-0000-4000-8000-000000000000"}')],
    expected: ['200 {"ok":false}'],
  },
  {
    id: 'rpc-http-rejecting-with-no-id-says-nothing-was-rejected',
    src: 'janux',
    steps: [post('/_janux/reject', '{}')],
    expected: ['200 {"ok":false}'],
  },
  {
    id: 'rpc-http-two-proposals-are-settled-independently',
    src: 'janux',
    steps: [
      callApi('refund', '{}', AGENT),
      post('/_janux/api/shop.transfer', '{"amount":5}', AGENT),
      { ...post('/_janux/approve', '{"id":"{id}"}'), withProposalId: true, recordEffects: true },
    ],
    expected: ['200 <proposal>', '200 <proposal>', ok('"transferred 5"'), 'side:transfer'],
  },

  // ── the surfaces that read ──────────────────────────────────────────────────
  {
    id: 'rpc-http-the-manifest-lists-every-reachable-api-tool',
    src: 'janux',
    steps: [{ path: '/_janux/manifest?path=/', method: 'GET' }],
    expected: ['200 tools=api.shop.read,api.shop.boom,api.shop.badOutput,api.shop.refund,api.shop.transfer'],
  },
  {
    id: 'rpc-http-the-manifest-omits-a-forbidden-tool',
    src: 'janux',
    steps: [{ path: '/_janux/manifest?path=/', method: 'GET' }],
    expected: ['200 omits=api.shop.closed'],
  },
  {
    // The MCP surface names a tool `shop.read`, without the `api.` prefix the
    // Janux manifest uses: an external client sees the app's namespace, not the
    // framework's internal one.
    id: 'rpc-http-the-mcp-endpoint-advertises-tools-without-the-api-prefix',
    src: 'janux',
    steps: [post('/_janux/mcp', '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')],
    expected: ['200 body-has={"name":"shop.read"'],
  },
  {
    id: 'rpc-http-the-mcp-endpoint-marks-a-confirm-tool-as-requiring-approval',
    src: 'janux',
    steps: [post('/_janux/mcp', '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')],
    expected: ['200 body-has="annotations":{"requiresApproval":true}'],
  },
  {
    /*
     * A forbidden tool is *advertised* by `tools/list` today — `deps.tools` is the
     * raw collection, not the guard-filtered one `apiManifestTools` builds — but
     * calling it still refuses, which is what this row pins. The advertisement gap
     * is reported separately rather than frozen here as if it were intended.
     */
    id: 'rpc-http-an-mcp-call-of-a-forbidden-tool-is-refused-as-an-error-result',
    src: 'janux',
    steps: [
      post('/_janux/mcp', '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"api.shop.closed","arguments":{}}}'),
    ],
    expected: ['200 body-has=Tool \\"shop.closed\\" is not available'],
  },
  {
    id: 'rpc-http-an-mcp-tool-call-runs-the-tool',
    src: 'janux',
    steps: [
      {
        ...post('/_janux/mcp', '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"api.shop.read","arguments":{"q":"via mcp"}}}'),
        recordEffects: true,
      },
    ],
    expected: ['200 body-has=via mcp', 'side:'],
  },
  {
    id: 'rpc-http-an-mcp-tool-call-on-a-confirm-tool-proposes-instead-of-running',
    src: 'janux',
    steps: [
      {
        ...post('/_janux/mcp', '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"api.shop.refund","arguments":{}}}'),
        recordEffects: true,
      },
    ],
    expected: ['200 body-has=\\"status\\":\\"proposal\\"', 'side:'],
  },
];
