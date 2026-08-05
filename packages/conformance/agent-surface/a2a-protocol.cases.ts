import { api, createJanuxServer } from '@janux/server';
import { int, jsx, schema, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The hosted A2A endpoint and its Agent Card, held to the protocol rather than
 * to our own implementation.
 *
 * `src: 'a2a:…'` marks a row the specification asks for; `src: 'janux'` marks
 * one where the spec leaves the choice open and this is the choice we made.
 * Every row goes through the real server's `fetch`, because the claim is about
 * the endpoint and not about a helper.
 *
 * @see https://a2a-protocol.org/latest/specification/
 */

type Server = ReturnType<typeof createJanuxServer>;

const ORIGIN = 'http://shop.test';
const WIRE = { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin' };

const apis = () => ({
  shop: {
    read: api({ description: 'Read it', input: schema({ q: str() }), run: ({ input }) => input }),
    pay: api({ description: 'Pay', guard: 'confirm' as const, input: schema({ amount: int() }), run: () => 'paid' }),
    nuke: api({ description: 'Never for agents', guard: 'forbidden' as const, run: () => 'boom' }),
  },
});

const SKILLS = [
  {
    name: 'refund',
    description: 'How a refund is issued end to end.',
    when: 'A customer asks for their money back.',
    tools: ['shop.pay'],
    body: '# Refund\n\nRead, then pay.',
    file: '/app/src/skills/refund.md',
  },
];

let openServer: Server | undefined;
let guardedServer: Server | undefined;

const shop = (): Server =>
  (openServer ??= createJanuxServer({
    title: 'Shop App',
    siteUrl: ORIGIN,
    llmsTxt: { description: 'A demo shop.' },
    routes: { '/': () => jsx('main', { children: jsx('h1', { children: 'Shop' }) }) },
    apis: apis(),
    skills: SKILLS,
  }));

const guarded = (): Server =>
  (guardedServer ??= createJanuxServer({
    title: 'Shop App',
    apis: apis(),
    mcpAuth: { verify: (token: string) => (token === 'good-token' ? { sub: 'u1' } : null) },
  }));

interface Reply {
  status: number;
  payload: any;
  headers: Headers;
}

async function post(server: Server, body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const res = await server.fetch(
    new Request(`${ORIGIN}/_janux/a2a`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { ...WIRE, ...headers },
    }),
  );

  return { status: res.status, payload: await res.json().catch(() => undefined), headers: res.headers };
}

const message = (method: string, params?: unknown, id: unknown = 1) => ({ jsonrpc: '2.0', id, method, params });

const send = (skill: string, input?: unknown, server: Server = shop()) =>
  post(
    server,
    message('SendMessage', { message: { role: 'ROLE_USER', messageId: 'm1', parts: [{ data: { skill, input } }] } }),
  );

const taskOf = async (skill: string, input?: unknown, server?: Server) => (await send(skill, input, server)).payload.result.task;

const card = async (path = '/.well-known/agent-card.json', server: Server = shop()): Promise<any> =>
  (await server.fetch(new Request(`${ORIGIN}${path}`))).json();

/** The one skill entry per id, whichever kind it is. */
const skillNamed = async (id: string) => (await card()).skills.find((skill: { id: string }) => skill.id === id);

export const A2A_PROTOCOL_CASES: ScenarioCase[] = [
  // ── discovery: the agent card ───────────────────────────────────────────────
  {
    id: 'a2a-the-card-lives-at-the-registered-well-known-uri',
    src: 'a2a:spec#8.2-discovery',
    run: async (log) => void log.push((await card()).name),
    expected: ['Shop App'],
  },
  {
    id: 'a2a-the-card-carries-every-field-the-spec-requires',
    src: 'a2a:spec#4.4.1-agent-card',
    run: async (log) => {
      const required = ['name', 'description', 'supportedInterfaces', 'version', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills'];
      const present = await card();

      log.push(required.filter((field) => present[field] === undefined).join(',') || 'all present');
    },
    expected: ['all present'],
  },
  {
    id: 'a2a-the-card-declares-one-json-rpc-interface-at-the-endpoint',
    src: 'a2a:spec#4.4.6-agent-interface',
    run: async (log) => void log.push(JSON.stringify((await card()).supportedInterfaces)),
    expected: ['[{"url":"http://shop.test/_janux/a2a","protocolBinding":"JSONRPC","protocolVersion":"1.0"}]'],
  },
  {
    id: 'a2a-a-stateless-endpoint-claims-neither-streaming-nor-push',
    src: 'a2a:spec#4.4.3-capabilities',
    run: async (log) => {
      const { streaming, pushNotifications } = (await card()).capabilities;

      log.push(`${streaming} ${pushNotifications}`);
    },
    expected: ['false false'],
  },
  {
    id: 'a2a-every-callable-tool-is-advertised-as-a-skill',
    src: 'a2a:spec#4.4.5-agent-skill',
    run: async (log) => void log.push((await card()).skills.map((skill: { id: string }) => skill.id).join(',')),
    expected: ['shop.read,shop.pay,skill:refund'],
  },
  {
    id: 'a2a-the-card-never-names-a-tool-the-guard-forbids',
    src: 'janux',
    run: async (log) => void log.push(`${JSON.stringify(await card()).includes('nuke')}`),
    expected: ['false'],
  },
  {
    id: 'a2a-a-confirm-guarded-skill-says-so-in-its-tags-before-it-is-ever-called',
    src: 'janux',
    run: async (log) => void log.push((await skillNamed('shop.pay')).tags.join(',')),
    expected: ['tool,confirm'],
  },
  {
    id: 'a2a-a-skill-carries-the-input-schema-a-client-needs-in-the-declared-extension',
    src: 'a2a:spec#4.6-extensions',
    run: async (log) => {
      const [extension] = (await card()).capabilities.extensions;

      log.push(JSON.stringify(extension.params.schemas['shop.read']));
    },
    expected: ['{"type":"object","properties":{"q":{"type":"string"}},"required":["q"],"additionalProperties":false}'],
  },
  {
    id: 'a2a-a-src-skills-procedure-is-advertised-as-a-procedure-not-as-a-tool',
    src: 'janux',
    run: async (log) => {
      const { name, tags, examples } = await skillNamed('skill:refund');

      log.push(`${name} ${tags.join(',')} ${examples.join('')}`);
    },
    expected: ['refund procedure A customer asks for their money back.'],
  },
  {
    id: 'a2a-the-card-reuses-the-description-the-app-already-wrote',
    src: 'janux',
    run: async (log) => void log.push((await card()).description),
    expected: ['A demo shop.'],
  },
  {
    id: 'a2a-a-bearer-protected-agent-declares-the-scheme-on-a-public-card',
    src: 'a2a:spec#4.5.3-http-auth',
    run: async (log) => {
      const scheme = (await card('/.well-known/agent-card.json', guarded())).securitySchemes.bearer.httpAuthSecurityScheme;

      log.push(scheme.scheme);
    },
    expected: ['Bearer'],
  },

  // ── SendMessage ─────────────────────────────────────────────────────────────
  {
    id: 'a2a-a-completed-call-comes-back-as-a-task-inside-the-send-message-result',
    src: 'a2a:spec#9.4.1-send-message',
    run: async (log) => {
      const { payload } = await send('shop.read', { q: 'hello' });

      log.push(`${payload.jsonrpc} id=${payload.id} task=${payload.result.task !== undefined}`);
    },
    expected: ['2.0 id=1 task=true'],
  },
  {
    id: 'a2a-a-finished-task-is-terminal-and-carries-its-output-as-an-artifact',
    src: 'a2a:spec#4.1.1-task',
    run: async (log) => {
      const task = await taskOf('shop.read', { q: 'hello' });

      log.push(`${task.status.state} ${JSON.stringify(task.artifacts[0].parts[0].data)}`);
    },
    expected: ['TASK_STATE_COMPLETED {"q":"hello"}'],
  },
  {
    id: 'a2a-task-states-are-serialised-as-proto-json-enum-names',
    src: 'a2a:spec#5.5-json-naming',
    run: async (log) => {
      const [done, parked] = await Promise.all([taskOf('shop.read', { q: 'x' }), taskOf('shop.pay', { amount: 1 })]);

      log.push(`${done.status.state} ${parked.status.state}`);
    },
    expected: ['TASK_STATE_COMPLETED TASK_STATE_INPUT_REQUIRED'],
  },
  {
    id: 'a2a-a-human-in-the-loop-guard-is-exactly-the-protocols-input-required-state',
    src: 'a2a:spec#4.1.3-task-state',
    run: async (log) => {
      const task = await taskOf('shop.pay', { amount: 3 });

      log.push(`${task.status.state} ran=${task.artifacts === undefined}`);
    },
    expected: ['TASK_STATE_INPUT_REQUIRED ran=true'],
  },
  {
    id: 'a2a-the-parked-task-tells-the-caller-what-a-human-has-to-settle',
    src: 'janux',
    run: async (log) => {
      const { parts } = (await taskOf('shop.pay', { amount: 3 })).status.message;

      log.push(`${parts[1].data.tool} ${JSON.stringify(parts[1].data.input)} ${parts[1].data.approve}`);
    },
    expected: ['shop.pay {"amount":3} /_janux/approve'],
  },
  {
    id: 'a2a-a-guard-refusal-is-a-failed-task-not-a-protocol-error',
    src: 'janux',
    run: async (log) => {
      const { payload } = await send('shop.nuke');

      log.push(`error=${'error' in payload} ${payload.result.task.status.state}`);
    },
    expected: ['error=false TASK_STATE_FAILED'],
  },
  {
    id: 'a2a-a-procedure-skill-answers-with-its-markdown-body',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify((await taskOf('skill:refund')).artifacts[0].parts[0].text)),
    expected: ['"# Refund\\n\\nRead, then pay."'],
  },
  {
    id: 'a2a-a-message-this-agent-cannot-read-is-a-content-type-error',
    src: 'a2a:spec#5.4-error-mapping',
    run: async (log) => {
      const { payload } = await post(shop(), message('SendMessage', { message: { role: 'ROLE_USER', messageId: 'm', parts: [{ text: 'hi' }] } }));

      log.push(String(payload.error.code));
    },
    expected: ['-32005'],
  },

  // ── GetTask ─────────────────────────────────────────────────────────────────
  {
    id: 'a2a-an-unknown-task-id-is-the-protocols-task-not-found',
    src: 'a2a:spec#5.4-error-mapping',
    run: async (log) => {
      const { payload } = await post(shop(), message('GetTask', { id: 'ghost' }));

      log.push(`${payload.error.code} ${payload.error.message}`);
    },
    expected: ['-32001 Task not found: ghost'],
  },
  {
    id: 'a2a-a-parked-task-can-be-polled-until-its-human-answers',
    src: 'a2a:spec#9.4.3-get-task',
    run: async (log) => {
      const parked = await taskOf('shop.pay', { amount: 5 });
      const { payload } = await post(shop(), message('GetTask', { id: parked.id }));

      log.push(`${payload.result.id === parked.id} ${payload.result.status.state}`);
    },
    expected: ['true TASK_STATE_INPUT_REQUIRED'],
  },

  // ── the HTTP and JSON-RPC surface ───────────────────────────────────────────
  {
    id: 'a2a-an-operation-this-agent-does-not-offer-is-unsupported-rather-than-unknown',
    src: 'a2a:spec#5.4-error-mapping',
    run: async (log) => {
      const { payload } = await post(shop(), message('SubscribeToTask', { id: 'x' }));

      log.push(String(payload.error.code));
    },
    expected: ['-32004'],
  },
  {
    id: 'a2a-a-method-from-another-protocol-is-method-not-found',
    src: 'a2a:spec#9.5-error-handling',
    run: async (log) => void log.push(String((await post(shop(), message('tools/call'))).payload.error.code)),
    expected: ['-32601'],
  },
  {
    id: 'a2a-unparseable-json-is-a-parse-error',
    src: 'a2a:spec#9.5-error-handling',
    run: async (log) => {
      const { status, payload } = await post(shop(), 'not json at all');

      log.push(`${status} ${payload.error.code}`);
    },
    expected: ['400 -32700'],
  },
  {
    id: 'a2a-a-get-answers-with-the-card-so-the-endpoint-documents-itself',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request(`${ORIGIN}/_janux/a2a`));

      log.push(`${res.status} ${(await res.json()).name}`);
    },
    expected: ['200 Shop App'],
  },
  {
    id: 'a2a-no-other-verb-is-served',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request(`${ORIGIN}/_janux/a2a`, { method: 'PUT', headers: WIRE }));

      log.push(`${res.status} allow=${res.headers.get('allow')}`);
    },
    expected: ['405 allow=POST'],
  },

  // ── auth: the same door policy as MCP ───────────────────────────────────────
  {
    id: 'a2a-a-call-without-a-token-is-401-when-the-app-requires-one',
    src: 'janux',
    run: async (log) => {
      const { status, headers } = await send('shop.read', { q: 'x' }, guarded());

      log.push(`${status} ${headers.get('www-authenticate')}`);
    },
    expected: ['401 Bearer realm="janux-a2a"'],
  },
  {
    id: 'a2a-the-same-token-the-mcp-endpoint-accepts-opens-this-one',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(
        guarded(),
        message('SendMessage', { message: { role: 'ROLE_USER', messageId: 'm', parts: [{ data: { skill: 'shop.read', input: { q: 'x' } } }] } }),
        { authorization: 'Bearer good-token' },
      );

      log.push(JSON.stringify(payload.result.task.artifacts[0].parts[0].data));
    },
    expected: ['{"q":"x"}'],
  },
  {
    id: 'a2a-the-card-of-a-protected-agent-is-still-public',
    src: 'a2a:spec#8.2-discovery',
    run: async (log) => {
      const res = await guarded().fetch(new Request(`${ORIGIN}/.well-known/agent-card.json`));

      log.push(String(res.status));
    },
    expected: ['200'],
  },
];
