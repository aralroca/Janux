import { api, createJanuxServer } from '@janux/server';
import { int, jsx, schema, str, type AuditEntry } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * One pipeline, three doors.
 *
 * `api()` tools reach app code by exactly three routes from outside: the bridge
 * (`POST /_janux/api/…` with `x-janux-origin: agent`, what the page's own agent
 * uses), the hosted MCP endpoint, and the hosted A2A endpoint. Each speaks a
 * different protocol; none of them has an invocation path of its own. Invariant
 * 4 — guards are enforced at the invocation pipeline, not in app code — is only
 * true if that holds, and it stops being true the moment one door grows a
 * shortcut.
 *
 * So every row here asks the same question three ways and expects one answer,
 * written out three times. A door that ever answers differently reads its
 * difference back in the failure.
 */

type Server = ReturnType<typeof createJanuxServer>;

const ORIGIN = 'http://shop.test';
const WIRE = { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin' };

/** Counts what actually ran, so "parked" can be asserted as "did not happen". */
const ran = { pay: 0 };
const audit: AuditEntry[] = [];

const apis = () => ({
  shop: {
    read: api({ description: 'Read it', input: schema({ q: str() }), run: ({ input }) => input }),
    pay: api({
      description: 'Pay',
      guard: 'confirm' as const,
      input: schema({ amount: int() }),
      run: () => {
        ran.pay += 1;

        return 'paid';
      },
    }),
    nuke: api({ description: 'Never for agents', guard: 'forbidden' as const, run: () => 'boom' }),
    scoped: api({
      description: 'Admins only',
      guard: ({ ctx }: { ctx: Record<string, unknown> }) => (ctx.role === 'admin' ? 'auto' : 'forbidden'),
      run: () => 'scoped',
    }),
  },
});

const routes = () => ({ '/': () => jsx('main', { children: jsx('h1', { children: 'Shop' }) }) });

let openServer: Server | undefined;
let adminServer: Server | undefined;

const shop = (): Server =>
  (openServer ??= createJanuxServer({
    title: 'Shop App',
    routes: routes(),
    apis: apis(),
    onAudit: (entry) => audit.push(entry),
  }));

const asAdmin = (): Server =>
  (adminServer ??= createJanuxServer({ title: 'Shop App', routes: routes(), apis: apis(), ctxFor: () => ({ role: 'admin' }) }));

/** The one shape every door's answer is normalised to, so three protocols can be compared literally. */
type Answer =
  | { kind: 'ok'; value: unknown }
  | { kind: 'error'; message: string }
  | { kind: 'proposal'; tool: string; input: unknown };

function show(answer: Answer): string {
  if (answer.kind === 'ok') return `ok ${JSON.stringify(answer.value)}`;
  if (answer.kind === 'error') return `error ${answer.message}`;

  return `proposal ${answer.tool} ${JSON.stringify(answer.input)}`;
}

const isProposal = (value: any): boolean => value?.status === 'proposal';

const asAnswer = (value: any): Answer =>
  isProposal(value) ? { kind: 'proposal', tool: value.tool, input: value.input } : { kind: 'ok', value };

const post = (server: Server, path: string, body: unknown, headers: Record<string, string> = {}) =>
  server.fetch(new Request(`${ORIGIN}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { ...WIRE, ...headers } }));

/** Door 1: the bridge the app's own agent uses. */
async function viaBridge(server: Server, tool: string, input: unknown): Promise<Answer> {
  const payload = await (await post(server, `/_janux/api/${tool}`, input ?? {}, { 'x-janux-origin': 'agent' })).json();

  if (!payload.ok) return { kind: 'error', message: payload.error.replace(/^Error: /, '') };

  return asAnswer(payload.result);
}

/** Door 2: the hosted MCP endpoint. */
async function viaMcp(server: Server, tool: string, input: unknown): Promise<Answer> {
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: input ?? {} } };
  const { result } = await (await post(server, '/_janux/mcp', message)).json();
  const text = result.content[0].text;

  if (result.isError) return { kind: 'error', message: text.replace(/^Error: /, '') };

  return asAnswer(JSON.parse(text));
}

/** Door 3: the hosted A2A endpoint. */
async function viaA2a(server: Server, tool: string, input: unknown): Promise<Answer> {
  const message = {
    jsonrpc: '2.0',
    id: 1,
    method: 'SendMessage',
    params: { message: { role: 'ROLE_USER', messageId: 'm1', parts: [{ data: { skill: tool, input } }] } },
  };
  const { task } = (await (await post(server, '/_janux/a2a', message)).json()).result;

  if (task.status.state === 'TASK_STATE_FAILED') {
    return { kind: 'error', message: task.status.message.parts[0].text.replace(/^Error: /, '') };
  }
  if (task.status.state === 'TASK_STATE_INPUT_REQUIRED') {
    const { tool: parked, input: parkedInput } = task.status.message.parts[1].data;

    return { kind: 'proposal', tool: parked, input: parkedInput };
  }

  return { kind: 'ok', value: task.artifacts[0].parts[0].data };
}

/** The same call, asked three ways, rendered as one line. */
async function everyWay(tool: string, input?: unknown, server: Server = shop()): Promise<string> {
  const answers = await Promise.all([viaBridge(server, tool, input), viaMcp(server, tool, input), viaA2a(server, tool, input)]);

  return answers.map(show).join(' | ');
}

/** What each door says exists, in its own vocabulary: page manifest, MCP listing, agent card. */
async function everyListing(server: Server = shop()): Promise<string> {
  const manifest = await (await server.fetch(new Request(`${ORIGIN}/_janux/manifest?path=/`))).json();
  const mcp = await (await post(server, '/_janux/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
  const card = await (await server.fetch(new Request(`${ORIGIN}/.well-known/agent-card.json`))).json();
  const listings = [
    manifest.tools.map((tool: { name: string }) => tool.name.replace(/^api\./, '')),
    mcp.result.tools.map((tool: { name: string }) => tool.name),
    card.skills.filter((skill: { tags: string[] }) => skill.tags.includes('tool')).map((skill: { id: string }) => skill.id),
  ];

  return listings.map((names) => names.sort().join(',')).join(' | ');
}

export const SURFACE_PARITY_CASES: ScenarioCase[] = [
  {
    id: 'parity-the-three-doors-run-an-auto-tool-and-answer-the-same-value',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.read', { q: 'hello' })),
    expected: ['ok {"q":"hello"} | ok {"q":"hello"} | ok {"q":"hello"}'],
  },
  {
    id: 'parity-the-three-doors-refuse-a-forbidden-tool-in-the-same-words',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.nuke')),
    expected: [
      'error Tool "shop.nuke" is not available | error Tool "shop.nuke" is not available | error Tool "shop.nuke" is not available',
    ],
  },
  {
    id: 'parity-the-three-doors-park-a-confirm-tool-instead-of-running-it',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.pay', { amount: 3 })),
    expected: ['proposal shop.pay {"amount":3} | proposal shop.pay {"amount":3} | proposal shop.pay {"amount":3}'],
  },
  {
    id: 'parity-not-one-of-the-three-doors-let-the-confirm-tool-run',
    src: 'janux',
    run: async (log) => {
      ran.pay = 0;
      await everyWay('shop.pay', { amount: 3 });

      log.push(`ran=${ran.pay}`);
    },
    expected: ['ran=0'],
  },
  {
    id: 'parity-all-three-parked-calls-land-in-the-audit-trail-the-same-way',
    src: 'janux',
    run: async (log) => {
      audit.length = 0;
      await everyWay('shop.pay', { amount: 3 });
      const parked = audit.filter((entry) => entry.tool === 'api.shop.pay');

      log.push(parked.map((entry) => `${entry.origin}/${entry.guard}/${entry.proposed}`).join(' | '));
    },
    expected: ['agent/confirm/true | agent/confirm/true | agent/confirm/true'],
  },
  {
    id: 'parity-the-three-doors-reject-invalid-input-in-the-same-words',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.read', { q: 7 })),
    expected: [
      'error Invalid input for "shop.read" — q: expected string | error Invalid input for "shop.read" — q: expected string | error Invalid input for "shop.read" — q: expected string',
    ],
  },
  {
    id: 'parity-the-three-doors-drop-undeclared-input-fields-alike',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.read', { q: 'kept', smuggled: 'dropped' })),
    expected: ['ok {"q":"kept"} | ok {"q":"kept"} | ok {"q":"kept"}'],
  },
  {
    id: 'parity-the-three-listings-advertise-exactly-the-same-tools',
    src: 'janux',
    run: async (log) => void log.push(await everyListing()),
    expected: ['shop.pay,shop.read | shop.pay,shop.read | shop.pay,shop.read'],
  },
  {
    id: 'parity-a-ctx-guard-that-refuses-hides-the-tool-from-all-three-listings',
    src: 'janux',
    run: async (log) => void log.push(`${(await everyListing()).includes('shop.scoped')}`),
    expected: ['false'],
  },
  {
    id: 'parity-a-ctx-guard-that-allows-shows-the-tool-on-all-three-listings',
    src: 'janux',
    run: async (log) => void log.push(await everyListing(asAdmin())),
    expected: ['shop.pay,shop.read,shop.scoped | shop.pay,shop.read,shop.scoped | shop.pay,shop.read,shop.scoped'],
  },
  {
    id: 'parity-a-tool-hidden-by-ctx-is-refused-through-all-three-doors',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.scoped')),
    expected: [
      'error Tool "shop.scoped" is not available | error Tool "shop.scoped" is not available | error Tool "shop.scoped" is not available',
    ],
  },
  {
    id: 'parity-a-tool-allowed-by-ctx-runs-through-all-three-doors',
    src: 'janux',
    run: async (log) => void log.push(await everyWay('shop.scoped', undefined, asAdmin())),
    expected: ['ok "scoped" | ok "scoped" | ok "scoped"'],
  },
];
