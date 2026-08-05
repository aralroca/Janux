import { api, createJanuxServer } from '@janux/server';
import { int, jsx, schema, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The hosted MCP endpoint, driven as an MCP client drives it.
 *
 * `/_janux/mcp` is the door an outside model knocks on, and it is generated
 * from the same `api()` functions the app already has — so the rows that matter
 * are the ones where the generated surface could disagree with the app: a tool
 * the guard forbids appearing in `tools/list`, an error that arrives as a
 * successful result, a cacheable answer that forgets it is private, or a modern
 * (2026-07-28) request whose mirrored headers do not match its body.
 *
 * Every row goes through the real server's `fetch`, because the claim is about
 * the endpoint and not about a helper.
 */

type Server = ReturnType<typeof createJanuxServer>;

const h = (tag: string, children: unknown) => jsx(tag, { children });

const ORIGIN = 'http://shop.test';
const WIRE = { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin' };

const apis = () => ({
  shop: {
    read: api({ description: 'Read it', input: schema({ q: str() }), run: ({ input }) => input }),
    pay: api({ description: 'Pay', guard: 'confirm' as const, input: schema({ amount: int() }), run: () => 'paid' }),
    nuke: api({ description: 'Never for agents', guard: 'forbidden' as const, run: () => 'boom' }),
    bare: api({ run: () => 'bare' }),
    scoped: api({
      description: 'Admins only',
      guard: ({ ctx }: { ctx: Record<string, unknown> }) => (ctx.role === 'admin' ? 'auto' : 'forbidden'),
      run: () => 'scoped',
    }),
    boom: api({
      description: 'Throws',
      run: () => {
        throw new Error('kaboom');
      },
    }),
  },
});

const pages = () => ({
  '/': () => h('main', [h('h1', 'Home'), h('p', 'Welcome')]),
  '/about': () => h('main', [h('h2', 'About us')]),
  '/broken': () => {
    throw new Error('page blew up');
  },
});

let openServer: Server | undefined;
let adminServer: Server | undefined;
let authServer: Server | undefined;

/** The ordinary app: no bearer, no request context. */
const shop = (): Server =>
  (openServer ??= createJanuxServer({ title: 'Shop App', routes: pages(), apis: apis() }));

/** The same app for a caller whose ctx says `admin`, so the scoped guard opens. */
const asAdmin = (): Server =>
  (adminServer ??= createJanuxServer({ title: 'Shop App', routes: pages(), apis: apis(), ctxFor: () => ({ role: 'admin' }) }));

/** The same app behind a bearer token. */
const guarded = (): Server =>
  (authServer ??= createJanuxServer({
    title: 'Shop App',
    routes: pages(),
    apis: apis(),
    mcpAuth: {
      verify: (token: string) => (token === 'good-token' ? { sub: 'u1' } : null),
      resourceMetadataUrl: 'https://auth.test/.well-known/resource',
    },
  }));

interface Reply {
  status: number;
  payload: any;
  headers: Headers;
}

async function post(server: Server, body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const res = await server.fetch(
    new Request(`${ORIGIN}/_janux/mcp`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { ...WIRE, ...headers },
    }),
  );

  return { status: res.status, payload: await res.json().catch(() => undefined), headers: res.headers };
}

/** Distinguishes "no id at all" from `id: null`, which mean different things on the wire. */
const NO_ID = Symbol('no-id');

const message = (method: string, params?: unknown, id: unknown = 1) => ({
  jsonrpc: '2.0',
  ...(id === NO_ID ? {} : { id }),
  method,
  ...(params === undefined ? {} : { params }),
});

const rpc = (method: string, params?: unknown, headers?: Record<string, string>) =>
  post(shop(), message(method, params), headers);

const resultOf = async (method: string, params?: unknown, headers?: Record<string, string>) =>
  (await rpc(method, params, headers)).payload.result;

const errorOf = async (method: string, params?: unknown, headers?: Record<string, string>) => {
  const { payload } = await rpc(method, params, headers);

  return `${payload.error.code} ${payload.error.message}`;
};

/** `name` of every advertised tool, in the order the endpoint listed them. */
const advertised = async (server: Server = shop()): Promise<string[]> =>
  (await post(server, message('tools/list'))).payload.result.tools.map((tool: { name: string }) => tool.name);

const descriptor = async (name: string, server: Server = shop()) =>
  (await post(server, message('tools/list'))).payload.result.tools.find((tool: { name: string }) => tool.name === name);

/** The text a `tools/call` answered with, plus whether it was flagged as an error. */
async function called(name: string, args?: unknown, server: Server = shop()): Promise<string> {
  const { payload } = await post(server, message('tools/call', { name, ...(args === undefined ? {} : { arguments: args }) }));
  const { content, isError } = payload.result;

  return `${isError ? 'error' : 'ok'} ${content[0].text}`;
}

const MODERN = '2026-07-28';
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';

const modernHeaders = (method: string, extra: Record<string, string> = {}) => ({
  'mcp-protocol-version': MODERN,
  'mcp-method': method,
  ...extra,
});

const modernParams = (params: Record<string, unknown> = {}) => ({ ...params, _meta: { [META_VERSION]: MODERN } });

const get = async (server: Server, accept: string): Promise<Response> =>
  server.fetch(new Request(`${ORIGIN}/_janux/mcp`, { headers: { accept } }));

const BROWSER = 'text/html,application/xhtml+xml';
const CLIENT = 'application/json, text/event-stream';

export const MCP_PROTOCOL_CASES: ScenarioCase[] = [
  // ── the JSON-RPC envelope ───────────────────────────────────────────────────
  {
    id: 'mcp-a-reply-echoes-the-request-id',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('ping', undefined, 42));

      log.push(`jsonrpc=${payload.jsonrpc} id=${payload.id}`);
    },
    expected: ['jsonrpc=2.0 id=42'],
  },
  {
    id: 'mcp-a-string-id-comes-back-as-a-string',
    src: 'mcp:spec#request-id',
    run: async (log) => {
      const { payload } = await post(shop(), message('ping', undefined, 'req-7'));

      log.push(JSON.stringify(payload.id));
    },
    expected: ['"req-7"'],
  },
  {
    id: 'mcp-an-absent-id-answers-with-null',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('ping', undefined, NO_ID));

      log.push(JSON.stringify(payload.id));
    },
    expected: ['null'],
  },
  {
    id: 'mcp-a-null-id-stays-null',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('ping', undefined, null));

      log.push(JSON.stringify(payload.id));
    },
    expected: ['null'],
  },
  {
    id: 'mcp-a-zero-id-is-not-mistaken-for-a-missing-one',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('ping', undefined, 0));

      log.push(JSON.stringify(payload.id));
    },
    expected: ['0'],
  },
  {
    id: 'mcp-unparseable-json-is-a-parse-error',
    src: 'mcp:spec#parse-error',
    run: async (log) => {
      const { status, payload } = await post(shop(), 'not json at all');

      log.push(`${status} ${payload.error.code} ${payload.error.message}`);
    },
    expected: ['400 -32700 Parse error'],
  },
  {
    id: 'mcp-an-empty-body-is-a-parse-error',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await post(shop(), '');

      log.push(`${status} ${payload.error.code}`);
    },
    expected: ['400 -32700'],
  },
  {
    id: 'mcp-a-parse-error-answers-with-a-null-id',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), '{oops');

      log.push(JSON.stringify(payload.id));
    },
    expected: ['null'],
  },
  {
    id: 'mcp-an-unknown-method-is-method-not-found',
    src: 'mcp:spec#method-not-found',
    run: async (log) => void log.push(await errorOf('tools/delete')),
    expected: ['-32601 Method not found: tools/delete'],
  },
  {
    id: 'mcp-a-method-not-found-still-answers-http-200',
    src: 'janux',
    run: async (log) => {
      const { status } = await rpc('nope/nope');

      log.push(String(status));
    },
    expected: ['200'],
  },
  {
    id: 'mcp-an-error-reply-carries-no-result',
    src: 'janux',
    run: async (log) => {
      const { payload } = await rpc('nope/nope');

      log.push(`result=${'result' in payload}`);
    },
    expected: ['result=false'],
  },
  {
    id: 'mcp-an-error-reply-is-not-decorated-with-server-info',
    src: 'janux',
    run: async (log) => {
      const { payload } = await rpc('nope/nope');

      log.push(`meta=${String(payload._meta)} error=${payload.error.code}`);
    },
    expected: ['meta=undefined error=-32601'],
  },

  // ── batching and notifications ──────────────────────────────────────────────
  {
    id: 'mcp-a-batch-answers-an-array-in-request-order',
    src: 'mcp:spec#batch',
    run: async (log) => {
      const { payload } = await post(shop(), [message('ping', undefined, 'a'), message('server/discover', undefined, 'b')]);

      log.push(payload.map((reply: { id: string }) => reply.id).join(','));
    },
    expected: ['a,b'],
  },
  {
    id: 'mcp-a-batch-mixes-results-and-errors',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), [message('ping', undefined, 1), message('nope', undefined, 2)]);

      log.push(payload.map((reply: any) => ('error' in reply ? `err:${reply.error.code}` : 'ok')).join(','));
    },
    expected: ['ok,err:-32601'],
  },
  {
    id: 'mcp-a-notification-alone-answers-202-with-no-body',
    src: 'mcp:spec#notification',
    run: async (log) => {
      const { status, payload } = await post(shop(), message('notifications/initialized', undefined, NO_ID));

      log.push(`${status} ${String(payload)}`);
    },
    expected: ['202 undefined'],
  },
  {
    id: 'mcp-the-bare-initialized-notification-is-accepted-too',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(shop(), message('initialized', undefined, NO_ID));

      log.push(String(status));
    },
    expected: ['202'],
  },
  {
    id: 'mcp-a-batch-of-only-notifications-answers-202',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(shop(), [
        message('notifications/initialized', undefined, NO_ID),
        message('initialized', undefined, NO_ID),
      ]);

      log.push(String(status));
    },
    expected: ['202'],
  },
  {
    id: 'mcp-a-notification-inside-a-batch-is-dropped-from-the-replies',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), [message('notifications/initialized', undefined, NO_ID), message('ping', undefined, 9)]);

      log.push(`replies=${payload.length} id=${payload[0].id}`);
    },
    expected: ['replies=1 id=9'],
  },
  {
    id: 'mcp-a-single-message-answers-an-object-not-an-array',
    src: 'janux',
    run: async (log) => {
      const { payload } = await rpc('ping');

      log.push(`array=${Array.isArray(payload)}`);
    },
    expected: ['array=false'],
  },

  // ── initialize / ping / discover ────────────────────────────────────────────
  {
    id: 'mcp-initialize-states-the-protocol-version',
    src: 'mcp:spec#initialize',
    run: async (log) => void log.push((await resultOf('initialize')).protocolVersion),
    expected: ['2025-06-18'],
  },
  {
    id: 'mcp-initialize-names-the-server-after-the-app-title',
    src: 'janux',
    run: async (log) => {
      const { name, version } = (await resultOf('initialize')).serverInfo;

      log.push(`${name} v${version}`);
    },
    expected: ['Shop App v1'],
  },
  {
    id: 'mcp-initialize-advertises-tools-and-resources',
    src: 'janux',
    run: async (log) => void log.push(Object.keys((await resultOf('initialize')).capabilities).join(',')),
    expected: ['tools,resources'],
  },
  {
    id: 'mcp-an-untitled-app-still-names-its-server',
    src: 'janux',
    run: async (log) => {
      const anonymous = createJanuxServer({ routes: { '/': () => h('main', 'x') } });
      const { payload } = await post(anonymous, message('initialize'));

      log.push(payload.result.serverInfo.name);
    },
    expected: ['janux-app'],
  },
  {
    id: 'mcp-a-stateless-server-serves-tools-without-an-initialize-first',
    src: 'janux',
    run: async (log) => {
      const fresh = createJanuxServer({ apis: apis() });
      const { payload } = await post(fresh, message('tools/list'));

      log.push(`tools=${payload.result.tools.length > 0}`);
    },
    expected: ['tools=true'],
  },
  {
    id: 'mcp-ping-answers-an-otherwise-empty-result',
    src: 'mcp:spec#ping',
    run: async (log) => {
      const { resultType, _meta, ...rest } = await resultOf('ping');

      log.push(`extra=${Object.keys(rest).length} type=${resultType}`);
    },
    expected: ['extra=0 type=complete'],
  },
  {
    id: 'mcp-discover-lists-every-supported-version-newest-first',
    src: 'mcp:2026-07-28#discover',
    run: async (log) => void log.push((await resultOf('server/discover')).supportedVersions.join(',')),
    expected: ['2026-07-28,2025-06-18'],
  },
  {
    // `subscribe` is `subscriptions/listen`, which only the modern era has. The
    // legacy handshake must not be told about a method it cannot ask for.
    id: 'mcp-discover-advertises-subscribe-to-the-modern-era-only',
    src: 'janux',
    run: async (log) => {
      const discovered = await resultOf('server/discover');
      const handshake = await resultOf('initialize');

      log.push(JSON.stringify(discovered.capabilities));
      log.push(JSON.stringify(handshake.capabilities));
    },
    expected: ['{"tools":{},"resources":{"subscribe":true}}', '{"tools":{},"resources":{}}'],
  },
  {
    id: 'mcp-discover-needs-no-handshake-and-no-version-header',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await rpc('server/discover');

      log.push(`${status} versions=${payload.result.supportedVersions.length}`);
    },
    expected: ['200 versions=2'],
  },
  {
    id: 'mcp-every-result-is-tagged-complete',
    src: 'mcp:2026-07-28#result-type',
    run: async (log) => {
      const results = await Promise.all([resultOf('ping'), resultOf('tools/list'), resultOf('resources/list')]);

      log.push(results.map((result) => result.resultType).join(','));
    },
    expected: ['complete,complete,complete'],
  },
  {
    id: 'mcp-every-result-carries-the-server-identity-in-meta',
    src: 'mcp:2026-07-28#server-info',
    run: async (log) => void log.push(JSON.stringify((await resultOf('ping'))._meta)),
    expected: ['{"io.modelcontextprotocol/serverInfo":{"name":"Shop App","version":"1"}}'],
  },

  // ── tools/list: what an outside model is told exists ────────────────────────
  {
    id: 'mcp-a-tool-is-advertised-under-its-wire-name',
    src: 'janux',
    run: async (log) => void log.push((await descriptor('shop.read')).name),
    expected: ['shop.read'],
  },
  {
    id: 'mcp-a-tool-carries-its-description',
    src: 'janux',
    run: async (log) => void log.push((await descriptor('shop.read')).description),
    expected: ['Read it'],
  },
  {
    id: 'mcp-a-tool-without-a-description-advertises-an-empty-one',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify((await descriptor('shop.bare')).description)),
    expected: ['""'],
  },
  {
    id: 'mcp-an-input-schema-is-projected-as-json-schema',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify((await descriptor('shop.read')).inputSchema)),
    expected: ['{"type":"object","properties":{"q":{"type":"string"}},"required":["q"],"additionalProperties":false}'],
  },
  {
    id: 'mcp-a-tool-without-an-input-advertises-an-open-object-schema',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify((await descriptor('shop.bare')).inputSchema)),
    expected: ['{"type":"object","properties":{}}'],
  },
  {
    id: 'mcp-a-confirm-tool-is-annotated-as-needing-approval',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify((await descriptor('shop.pay')).annotations)),
    expected: ['{"requiresApproval":true}'],
  },
  {
    id: 'mcp-an-auto-tool-carries-no-annotations',
    src: 'janux',
    run: async (log) => void log.push(String((await descriptor('shop.read')).annotations)),
    expected: ['undefined'],
  },
  {
    id: 'mcp-tools-list-never-advertises-a-forbidden-tool',
    src: 'janux',
    run: async (log) => void log.push(`nuke=${(await advertised()).includes('shop.nuke')}`),
    expected: ['nuke=false'],
  },
  {
    id: 'mcp-a-forbidden-tool-leaks-neither-its-description-nor-its-schema',
    src: 'janux',
    run: async (log) => {
      const listed = JSON.stringify((await post(shop(), message('tools/list'))).payload.result.tools);

      log.push(`name=${listed.includes('shop.nuke')} description=${listed.includes('Never for agents')}`);
    },
    expected: ['name=false description=false'],
  },
  {
    id: 'mcp-a-ctx-guard-that-refuses-keeps-its-tool-off-the-list',
    src: 'janux',
    run: async (log) => void log.push(`scoped=${(await advertised()).includes('shop.scoped')}`),
    expected: ['scoped=false'],
  },
  {
    id: 'mcp-a-ctx-guard-that-allows-puts-its-tool-on-the-list',
    src: 'janux',
    run: async (log) => void log.push(`scoped=${(await advertised(asAdmin())).includes('shop.scoped')}`),
    expected: ['scoped=true'],
  },
  {
    id: 'mcp-tools-list-and-the-page-manifest-name-the-same-tools',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request(`${ORIGIN}/_janux/manifest?path=/`));
      const manifest = (await res.json()) as { tools: { name: string }[] };
      const fromManifest = manifest.tools.map((tool) => tool.name.replace(/^api\./, '')).sort();

      log.push(`${(await advertised()).sort().join(',')} | ${fromManifest.join(',')}`);
    },
    expected: ['shop.bare,shop.boom,shop.pay,shop.read | shop.bare,shop.boom,shop.pay,shop.read'],
  },
  {
    id: 'mcp-tools-list-follows-the-declaration-order',
    src: 'janux',
    run: async (log) => void log.push((await advertised()).join(',')),
    expected: ['shop.read,shop.pay,shop.bare,shop.boom'],
  },
  {
    id: 'mcp-tools-list-is-the-same-list-on-every-request',
    src: 'janux',
    run: async (log) => {
      const [first, second] = await Promise.all([advertised(), advertised()]);

      log.push(`stable=${first.join(',') === second.join(',')}`);
    },
    expected: ['stable=true'],
  },
  {
    id: 'mcp-an-app-with-no-apis-advertises-an-empty-tool-list',
    src: 'janux',
    run: async (log) => {
      const bare = createJanuxServer({ routes: { '/': () => h('main', 'x') } });
      const { payload } = await post(bare, message('tools/list'));

      log.push(JSON.stringify(payload.result.tools));
    },
    expected: ['[]'],
  },
  {
    id: 'mcp-tools-list-is-cacheable-for-a-minute',
    src: 'mcp:2026-07-28#cacheable-result',
    run: async (log) => {
      const { ttlMs, cacheScope } = await resultOf('tools/list');

      log.push(`${ttlMs} ${cacheScope}`);
    },
    expected: ['60000 public'],
  },
  {
    id: 'mcp-a-private-endpoint-marks-its-cacheable-results-private',
    src: 'mcp:2026-07-28#cache-scope',
    run: async (log) => {
      const { payload } = await post(guarded(), message('tools/list'), { authorization: 'Bearer good-token' });

      log.push(payload.result.cacheScope);
    },
    expected: ['private'],
  },
  {
    id: 'mcp-a-tool-call-result-is-never-cacheable',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('tools/call', { name: 'shop.read', arguments: { q: 'x' } }));

      log.push(`ttl=${String(payload.result.ttlMs)} scope=${String(payload.result.cacheScope)}`);
    },
    expected: ['ttl=undefined scope=undefined'],
  },
  {
    id: 'mcp-initialize-is-not-a-cacheable-result',
    src: 'janux',
    run: async (log) => void log.push(`ttl=${String((await resultOf('initialize')).ttlMs)}`),
    expected: ['ttl=undefined'],
  },

  // ── tools/call ──────────────────────────────────────────────────────────────
  {
    id: 'mcp-a-call-answers-with-the-result-as-json-text',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.read', { q: 'hello' })),
    expected: ['ok {"q":"hello"}'],
  },
  {
    id: 'mcp-a-call-content-block-is-typed-as-text',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('tools/call', { name: 'shop.bare' }));

      log.push(payload.result.content[0].type);
    },
    expected: ['text'],
  },
  {
    id: 'mcp-missing-arguments-are-an-empty-object-not-undefined',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.bare')),
    expected: ['ok "bare"'],
  },
  {
    id: 'mcp-the-api-prefixed-name-reaches-the-same-tool',
    src: 'janux',
    run: async (log) => void log.push(await called('api.shop.read', { q: 'prefixed' })),
    expected: ['ok {"q":"prefixed"}'],
  },
  {
    id: 'mcp-an-unknown-tool-is-an-error-result-not-a-protocol-error',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('tools/call', { name: 'shop.ghost' }));

      log.push(`error=${'error' in payload} isError=${payload.result.isError}`);
    },
    expected: ['error=false isError=true'],
  },
  {
    id: 'mcp-an-unknown-tool-says-which-name-it-could-not-find',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.ghost')),
    expected: ['error Error: Unknown api tool "shop.ghost"'],
  },
  {
    id: 'mcp-a-forbidden-tool-refuses-even-when-called-by-name',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.nuke')),
    expected: ['error Error: Tool "shop.nuke" is not available'],
  },
  {
    id: 'mcp-a-ctx-forbidden-tool-refuses-the-caller-it-was-hidden-from',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.scoped')),
    expected: ['error Error: Tool "shop.scoped" is not available'],
  },
  {
    id: 'mcp-a-ctx-allowed-tool-runs-for-the-caller-it-was-listed-for',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.scoped', {}, asAdmin())),
    expected: ['ok "scoped"'],
  },
  {
    id: 'mcp-a-throwing-tool-is-reported-as-an-error-result',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.boom')),
    expected: ['error Error: kaboom'],
  },
  {
    id: 'mcp-invalid-input-names-the-field-that-broke',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.read', { q: 7 })),
    expected: ['error Error: Invalid input for "shop.read" — q: expected string'],
  },
  {
    id: 'mcp-a-confirm-tool-answers-with-a-proposal-instead-of-running',
    src: 'janux',
    run: async (log) => {
      const answer = await called('shop.pay', { amount: 3 });
      const { status, tool, input } = JSON.parse(answer.slice('ok '.length));

      log.push(`${status} ${tool} ${JSON.stringify(input)}`);
    },
    expected: ['proposal shop.pay {"amount":3}'],
  },
  {
    id: 'mcp-a-proposal-id-is-not-guessable',
    src: 'janux',
    run: async (log) => {
      const answer = await called('shop.pay', { amount: 1 });
      const { id } = JSON.parse(answer.slice('ok '.length));

      // Random id, then the vault's HMAC — 32 bytes as base64url is 43 chars.
      log.push(`shape=${/^prop_api_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(id)}`);
    },
    expected: ['shape=true'],
  },
  {
    id: 'mcp-two-proposals-never-share-an-id',
    src: 'janux',
    run: async (log) => {
      const ids = await Promise.all([called('shop.pay', { amount: 1 }), called('shop.pay', { amount: 2 })]);
      const parsed = ids.map((answer) => JSON.parse(answer.slice('ok '.length)).id);

      log.push(`distinct=${parsed[0] !== parsed[1]}`);
    },
    expected: ['distinct=true'],
  },
  {
    id: 'mcp-a-proposal-validates-its-input-before-parking-it',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.pay', { amount: 'lots' })),
    expected: ['error Error: Invalid input for "shop.pay" — amount: expected int'],
  },
  {
    id: 'mcp-undeclared-input-fields-never-reach-the-tool',
    src: 'janux',
    run: async (log) => void log.push(await called('shop.read', { q: 'kept', smuggled: 'dropped' })),
    expected: ['ok {"q":"kept"}'],
  },
  {
    id: 'mcp-a-call-without-a-name-cannot-find-a-tool',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('tools/call', {}));

      log.push(payload.result.content[0].text);
    },
    expected: ['Error: Unknown api tool "undefined"'],
  },

  // ── resources: the app's pages ──────────────────────────────────────────────
  {
    id: 'mcp-resources-list-exposes-every-page',
    src: 'janux',
    run: async (log) => {
      const { resources } = await resultOf('resources/list');

      log.push(resources.map((resource: { name: string }) => resource.name).join(','));
    },
    expected: ['/,/about,/broken'],
  },
  {
    id: 'mcp-a-page-resource-uri-carries-the-janux-page-scheme',
    src: 'janux',
    run: async (log) => {
      const { resources } = await resultOf('resources/list');

      log.push(resources[1].uri);
    },
    expected: ['janux://page/about'],
  },
  {
    id: 'mcp-page-resources-are-markdown',
    src: 'janux',
    run: async (log) => {
      const { resources } = await resultOf('resources/list');

      log.push([...new Set(resources.map((resource: { mimeType: string }) => resource.mimeType))].join(','));
    },
    expected: ['text/markdown'],
  },
  {
    id: 'mcp-resources-list-is-cacheable',
    src: 'janux',
    run: async (log) => {
      const { ttlMs, cacheScope } = await resultOf('resources/list');

      log.push(`${ttlMs} ${cacheScope}`);
    },
    expected: ['60000 public'],
  },
  {
    id: 'mcp-reading-a-page-resource-returns-its-markdown',
    src: 'janux',
    run: async (log) => {
      const { contents } = await resultOf('resources/read', { uri: 'janux://page/about' });

      log.push(JSON.stringify(contents[0].text));
    },
    expected: ['"# Shop App\\n\\n## About us"'],
  },
  {
    id: 'mcp-a-read-echoes-the-uri-it-was-asked-for',
    src: 'janux',
    run: async (log) => {
      const { contents } = await resultOf('resources/read', { uri: 'janux://page/' });

      log.push(`${contents[0].uri} ${contents[0].mimeType}`);
    },
    expected: ['janux://page/ text/markdown'],
  },
  {
    id: 'mcp-the-bare-page-scheme-reads-the-home-page',
    src: 'janux',
    run: async (log) => {
      const { contents } = await resultOf('resources/read', { uri: 'janux://page' });

      log.push(JSON.stringify(contents[0].text));
    },
    expected: ['"# Home\\n\\nWelcome"'],
  },
  {
    id: 'mcp-an-unknown-scheme-is-an-invalid-params-error',
    src: 'janux',
    run: async (log) => void log.push(await errorOf('resources/read', { uri: 'file:///etc/passwd' })),
    expected: ['-32602 Unknown resource: file:///etc/passwd'],
  },
  {
    id: 'mcp-a-read-without-a-uri-is-an-invalid-params-error',
    src: 'janux',
    run: async (log) => void log.push(await errorOf('resources/read', {})),
    expected: ['-32602 Unknown resource: undefined'],
  },
  {
    id: 'mcp-a-page-under-the-right-scheme-that-does-not-exist-is-unknown',
    src: 'janux',
    run: async (log) => void log.push(await errorOf('resources/read', { uri: 'janux://page/missing' })),
    expected: ['-32602 Unknown resource: janux://page/missing'],
  },
  {
    id: 'mcp-a-page-that-fails-to-render-has-no-resource-to-read',
    src: 'janux',
    run: async (log) => void log.push(await errorOf('resources/read', { uri: 'janux://page/broken' })),
    expected: ['-32602 Unknown resource: janux://page/broken'],
  },
  {
    id: 'mcp-a-resource-read-is-cacheable-like-the-listing',
    src: 'janux',
    run: async (log) => {
      const { ttlMs } = await resultOf('resources/read', { uri: 'janux://page/' });

      log.push(String(ttlMs));
    },
    expected: ['60000'],
  },

  // ── the HTTP surface around the protocol ────────────────────────────────────
  {
    id: 'mcp-a-get-from-an-mcp-client-is-405',
    src: 'mcp:streamable-http#get',
    run: async (log) => {
      const res = await get(shop(), CLIENT);

      log.push(`${res.status} allow=${res.headers.get('allow')}`);
    },
    expected: ['405 allow=POST'],
  },
  {
    id: 'mcp-a-get-with-no-accept-header-is-405',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request(`${ORIGIN}/_janux/mcp`));

      log.push(String(res.status));
    },
    expected: ['405'],
  },
  {
    id: 'mcp-a-put-is-405',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request(`${ORIGIN}/_janux/mcp`, { method: 'PUT', headers: WIRE }));

      log.push(`${res.status} allow=${res.headers.get('allow')}`);
    },
    expected: ['405 allow=POST'],
  },
  {
    id: 'mcp-a-delete-is-405',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request(`${ORIGIN}/_janux/mcp`, { method: 'DELETE', headers: WIRE }));

      log.push(String(res.status));
    },
    expected: ['405'],
  },
  {
    id: 'mcp-a-browser-get-is-answered-with-instructions-instead',
    src: 'janux',
    run: async (log) => {
      const res = await get(shop(), BROWSER);

      log.push(`${res.status} ${res.headers.get('content-type')}`);
    },
    expected: ['200 text/html;charset=utf-8'],
  },
  {
    id: 'mcp-the-landing-page-names-the-server-in-its-title',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(shop(), BROWSER)).text();

      log.push(html.match(/<title>([^<]*)<\/title>/)![1]!);
    },
    expected: ['Shop App — MCP endpoint'],
  },
  {
    id: 'mcp-the-landing-page-lists-the-tools-it-serves',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(shop(), BROWSER)).text();

      log.push(`read=${html.includes('shop.read')} count=${html.includes('Tools (4 tools)')}`);
    },
    expected: ['read=true count=true'],
  },
  {
    id: 'mcp-the-landing-page-names-the-same-tools-the-protocol-advertises',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(shop(), BROWSER)).text();
      const listed = [...html.matchAll(/<li><code>(shop\.[a-z]+)<\/code>/g)].map((match) => match[1]);

      log.push(`${listed.join(',')} | ${(await advertised()).join(',')}`);
    },
    expected: ['shop.read,shop.pay,shop.bare,shop.boom | shop.read,shop.pay,shop.bare,shop.boom'],
  },
  {
    id: 'mcp-the-landing-page-never-names-a-forbidden-tool-to-an-unauthenticated-visitor',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(guarded(), BROWSER)).text();

      log.push(`name=${html.includes('shop.nuke')} description=${html.includes('Never for agents')}`);
    },
    expected: ['name=false description=false'],
  },
  {
    id: 'mcp-a-tool-only-a-privileged-ctx-may-call-appears-only-on-that-callers-landing',
    src: 'janux',
    run: async (log) => {
      const [open, admin] = await Promise.all([
        get(shop(), BROWSER).then((res) => res.text()),
        get(asAdmin(), BROWSER).then((res) => res.text()),
      ]);

      log.push(`open=${open.includes('shop.scoped')} admin=${admin.includes('shop.scoped')}`);
    },
    expected: ['open=false admin=true'],
  },
  {
    id: 'mcp-the-landing-page-singularises-a-lone-tool',
    src: 'janux',
    run: async (log) => {
      const lonely = createJanuxServer({ title: 'Solo', apis: { only: { one: api({ run: () => 1 }) } } });
      const html = await (await get(lonely, BROWSER)).text();

      log.push(html.includes('Tools (1 tool)') ? 'singular' : 'plural');
    },
    expected: ['singular'],
  },
  {
    id: 'mcp-the-landing-page-slugs-the-server-name-into-the-connect-command',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(shop(), BROWSER)).text();

      log.push(html.includes('claude mcp add --transport http shop-app') ? 'slugged' : html);
    },
    expected: ['slugged'],
  },
  {
    id: 'mcp-an-open-endpoint-shows-no-authorization-header-in-its-commands',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(shop(), BROWSER)).text();

      log.push(`auth=${html.includes('Authorization: Bearer')}`);
    },
    expected: ['auth=false'],
  },
  {
    id: 'mcp-a-guarded-endpoint-shows-a-token-placeholder-and-never-a-token',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(guarded(), BROWSER)).text();

      log.push(`placeholder=${html.includes('Bearer $TOKEN')} leak=${html.includes('good-token')}`);
    },
    expected: ['placeholder=true leak=false'],
  },
  {
    id: 'mcp-the-landing-page-explains-why-a-get-is-a-405',
    src: 'janux',
    run: async (log) => {
      const html = await (await get(shop(), BROWSER)).text();

      log.push(`explains=${html.includes('<code>405</code>')}`);
    },
    expected: ['explains=true'],
  },
  {
    id: 'mcp-an-app-with-no-tools-says-so-on-the-landing-page',
    src: 'janux',
    run: async (log) => {
      const empty = createJanuxServer({ title: 'Empty', routes: { '/': () => h('main', 'x') } });
      const html = await (await get(empty, BROWSER)).text();

      log.push(`invites=${html.includes('No <code>api()</code> tools yet')} count=${html.includes('Tools (0 tools)')}`);
    },
    expected: ['invites=true count=true'],
  },

  // ── bearer auth ─────────────────────────────────────────────────────────────
  {
    id: 'mcp-a-request-without-a-token-is-401',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(guarded(), message('tools/list'));

      log.push(String(status));
    },
    expected: ['401'],
  },
  {
    id: 'mcp-a-401-names-the-realm-in-www-authenticate',
    src: 'janux',
    run: async (log) => {
      const { headers } = await post(guarded(), message('tools/list'));

      log.push(headers.get('www-authenticate')!);
    },
    expected: ['Bearer realm="janux-mcp", resource_metadata="https://auth.test/.well-known/resource"'],
  },
  {
    id: 'mcp-a-401-without-resource-metadata-still-names-the-realm',
    src: 'janux',
    run: async (log) => {
      const plain = createJanuxServer({ apis: apis(), mcpAuth: { verify: () => null } });
      const { headers } = await post(plain, message('tools/list'));

      log.push(headers.get('www-authenticate')!);
    },
    expected: ['Bearer realm="janux-mcp"'],
  },
  {
    id: 'mcp-a-401-carries-no-body-to-leak',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(guarded(), message('tools/list'));

      log.push(String(payload));
    },
    expected: ['undefined'],
  },
  {
    id: 'mcp-a-wrong-token-is-refused',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(guarded(), message('tools/list'), { authorization: 'Bearer wrong' });

      log.push(String(status));
    },
    expected: ['401'],
  },
  {
    id: 'mcp-a-good-token-is-served',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await post(guarded(), message('tools/list'), { authorization: 'Bearer good-token' });

      log.push(`${status} tools=${payload.result.tools.length}`);
    },
    expected: ['200 tools=4'],
  },
  {
    id: 'mcp-the-bearer-scheme-is-matched-case-insensitively',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(guarded(), message('ping'), { authorization: 'bearer good-token' });

      log.push(String(status));
    },
    expected: ['200'],
  },
  {
    id: 'mcp-a-token-without-the-bearer-scheme-is-taken-verbatim',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(guarded(), message('ping'), { authorization: 'good-token' });

      log.push(String(status));
    },
    expected: ['200'],
  },
  {
    id: 'mcp-auth-is-checked-before-the-body-is-parsed',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await post(guarded(), 'not json', { authorization: 'Bearer wrong' });

      log.push(`${status} ${String(payload)}`);
    },
    expected: ['401 undefined'],
  },
  {
    id: 'mcp-an-open-endpoint-ignores-an-authorization-header',
    src: 'janux',
    run: async (log) => {
      const { status } = await post(shop(), message('ping'), { authorization: 'Bearer whatever' });

      log.push(String(status));
    },
    expected: ['200'],
  },
  {
    id: 'mcp-a-browser-get-needs-no-token',
    src: 'janux',
    run: async (log) => {
      const res = await get(guarded(), BROWSER);

      log.push(String(res.status));
    },
    expected: ['200'],
  },

  // ── the 2026-07-28 modern era ───────────────────────────────────────────────
  {
    id: 'mcp-a-modern-request-is-served-with-no-handshake-at-all',
    src: 'mcp:2026-07-28#per-request',
    run: async (log) => {
      const { status, payload } = await rpc('tools/list', modernParams(), modernHeaders('tools/list'));

      log.push(`${status} tools=${payload.result.tools.length}`);
    },
    expected: ['200 tools=4'],
  },
  {
    id: 'mcp-an-unsupported-modern-version-is-refused',
    src: 'mcp:2026-07-28#unsupported-version',
    run: async (log) => {
      const { status, payload } = await rpc('tools/list', undefined, { 'mcp-protocol-version': '2099-01-01' });

      log.push(`${status} ${payload.error.code} ${payload.error.message}`);
    },
    expected: ['400 -32022 Unsupported protocol version'],
  },
  {
    id: 'mcp-an-unsupported-version-error-lists-what-is-supported',
    src: 'mcp:2026-07-28#unsupported-version-data',
    run: async (log) => {
      const { payload } = await rpc('tools/list', undefined, { 'mcp-protocol-version': '2099-01-01' });

      log.push(JSON.stringify(payload.error.data));
    },
    expected: ['{"supported":["2026-07-28","2025-06-18"],"requested":"2099-01-01"}'],
  },
  {
    id: 'mcp-an-unsupported-version-error-keeps-the-request-id',
    src: 'janux',
    run: async (log) => {
      const { payload } = await post(shop(), message('ping', undefined, 'v-check'), { 'mcp-protocol-version': '2099-01-01' });

      log.push(JSON.stringify(payload.id));
    },
    expected: ['"v-check"'],
  },
  {
    id: 'mcp-a-version-that-only-appears-in-meta-mismatches-the-header',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await rpc('tools/list', modernParams());

      log.push(`${status} ${payload.error.code} ${payload.error.message}`);
    },
    expected: ['400 -32020 Header mismatch'],
  },
  {
    id: 'mcp-a-modern-request-whose-meta-omits-the-version-is-a-mismatch',
    src: 'mcp:2026-07-28#mirrored-headers',
    run: async (log) => {
      const { payload } = await rpc('tools/list', {}, modernHeaders('tools/list'));

      log.push(`${payload.error.code} ${payload.error.message}`);
    },
    expected: ['-32020 Header mismatch'],
  },
  {
    id: 'mcp-a-method-header-naming-another-method-is-a-mismatch',
    src: 'mcp:2026-07-28#method-header',
    run: async (log) => {
      const { payload } = await rpc('tools/list', modernParams(), modernHeaders('resources/list'));

      log.push(String(payload.error.code));
    },
    expected: ['-32020'],
  },
  {
    id: 'mcp-a-modern-request-with-no-method-header-is-a-mismatch',
    src: 'janux',
    run: async (log) => {
      const { payload } = await rpc('tools/list', modernParams(), { 'mcp-protocol-version': MODERN });

      log.push(String(payload.error.code));
    },
    expected: ['-32020'],
  },
  {
    id: 'mcp-a-modern-tools-call-must-mirror-the-tool-name',
    src: 'mcp:2026-07-28#name-header',
    run: async (log) => {
      const params = modernParams({ name: 'shop.read', arguments: { q: 'x' } });
      const { payload } = await rpc('tools/call', params, modernHeaders('tools/call'));

      log.push(String(payload.error.code));
    },
    expected: ['-32020'],
  },
  {
    id: 'mcp-a-modern-tools-call-with-the-matching-name-header-runs',
    src: 'janux',
    run: async (log) => {
      const params = modernParams({ name: 'shop.read', arguments: { q: 'modern' } });
      const { payload } = await rpc('tools/call', params, modernHeaders('tools/call', { 'mcp-name': 'shop.read' }));

      log.push(payload.result.content[0].text);
    },
    expected: ['{"q":"modern"}'],
  },
  {
    id: 'mcp-a-name-header-for-another-tool-is-a-mismatch',
    src: 'janux',
    run: async (log) => {
      const params = modernParams({ name: 'shop.read', arguments: { q: 'x' } });
      const { payload } = await rpc('tools/call', params, modernHeaders('tools/call', { 'mcp-name': 'shop.bare' }));

      log.push(String(payload.error.code));
    },
    expected: ['-32020'],
  },
  {
    id: 'mcp-a-base64-sentinel-name-is-decoded-before-it-is-compared',
    src: 'mcp:2026-07-28#sentinel',
    run: async (log) => {
      const sentinel = `=?base64?${btoa('shop.read')}?=`;
      const params = modernParams({ name: 'shop.read', arguments: { q: 'sentinel' } });
      const { payload } = await rpc('tools/call', params, modernHeaders('tools/call', { 'mcp-name': sentinel }));

      log.push(payload.result.content[0].text);
    },
    expected: ['{"q":"sentinel"}'],
  },
  {
    id: 'mcp-a-malformed-sentinel-is-a-mismatch-not-a-crash',
    src: 'janux',
    run: async (log) => {
      const params = modernParams({ name: 'shop.read', arguments: { q: 'x' } });
      const { status, payload } = await rpc('tools/call', params, modernHeaders('tools/call', { 'mcp-name': '=?base64?!!!?=' }));

      log.push(`${status} ${payload.error.code}`);
    },
    expected: ['400 -32020'],
  },
  {
    id: 'mcp-a-modern-resources-read-mirrors-the-uri',
    src: 'mcp:2026-07-28#name-header-uri',
    run: async (log) => {
      const params = modernParams({ uri: 'janux://page/' });
      const { payload } = await rpc('resources/read', params, modernHeaders('resources/read', { 'mcp-name': 'janux://page/' }));

      log.push(JSON.stringify(payload.result.contents[0].text));
    },
    expected: ['"# Home\\n\\nWelcome"'],
  },
  {
    id: 'mcp-a-modern-resources-read-without-the-uri-header-is-a-mismatch',
    src: 'janux',
    run: async (log) => {
      const params = modernParams({ uri: 'janux://page/' });
      const { payload } = await rpc('resources/read', params, modernHeaders('resources/read'));

      log.push(String(payload.error.code));
    },
    expected: ['-32020'],
  },
  {
    id: 'mcp-a-modern-method-with-no-mirrored-field-needs-no-name-header',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await rpc('resources/list', modernParams(), modernHeaders('resources/list'));

      log.push(`${status} resources=${payload.result.resources.length}`);
    },
    expected: ['200 resources=3'],
  },
  {
    id: 'mcp-the-2025-version-stays-on-the-legacy-path',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await rpc('tools/list', undefined, { 'mcp-protocol-version': '2025-06-18' });

      log.push(`${status} tools=${payload.result.tools.length}`);
    },
    expected: ['200 tools=4'],
  },
  {
    id: 'mcp-a-very-old-version-is-legacy-rather-than-unsupported',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await rpc('ping', undefined, { 'mcp-protocol-version': '2024-11-05' });

      log.push(`${status} error=${'error' in payload}`);
    },
    expected: ['200 error=false'],
  },
  {
    id: 'mcp-no-version-at-all-is-legacy',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await rpc('tools/list');

      log.push(`${status} error=${'error' in payload}`);
    },
    expected: ['200 error=false'],
  },
  {
    id: 'mcp-a-legacy-request-needs-no-mirrored-headers',
    src: 'janux',
    run: async (log) => {
      const { status } = await rpc('tools/call', { name: 'shop.bare' }, { 'mcp-protocol-version': '2025-06-18' });

      log.push(String(status));
    },
    expected: ['200'],
  },
  {
    id: 'mcp-a-batch-is-never-put-through-the-modern-gate',
    src: 'janux',
    run: async (log) => {
      const { status, payload } = await post(shop(), [message('ping', undefined, 1)], { 'mcp-protocol-version': '2099-01-01' });

      log.push(`${status} error=${'error' in payload[0]}`);
    },
    expected: ['200 error=false'],
  },
  {
    id: 'mcp-a-modern-gate-refusal-answers-http-400',
    src: 'janux',
    run: async (log) => {
      const { status } = await rpc('tools/list', modernParams(), modernHeaders('ping'));

      log.push(String(status));
    },
    expected: ['400'],
  },
];
