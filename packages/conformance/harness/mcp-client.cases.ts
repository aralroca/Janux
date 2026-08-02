import { connectMcp, createMcpPool } from '@janux/agent';
import { api, createJanuxServer } from '@janux/server';
import { jsx, schema, str } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The outbound half: the agent as an MCP *client*.
 *
 * It talks to servers it does not control, so the rows that matter are the ones
 * about not trusting them: a server that answers 400 because it is old must be
 * detected and retried through the legacy handshake, but a 400 that is a real
 * modern-era refusal must not be mistaken for one; a dead connection must be
 * evicted from the per-user pool instead of being handed to the next turn; and
 * a remote tool name must arrive namespaced so it cannot collide with the app's
 * own tools.
 */

const META = 'io.modelcontextprotocol/';
const MODERN = '2026-07-28';

interface Recorded {
  method: string;
  params: any;
  headers: Record<string, string>;
}

interface Mock {
  calls: Recorded[];
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
}

const TOOL = { name: 'search', description: 'Search the corpus', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } };

/**
 * A remote server of a chosen era. `legacy` answers a modern request with the
 * pre-2026 "not initialized" refusal, which is the signal to fall back.
 */
function mock(era: 'modern' | 'legacy', tools: unknown[] = [TOOL]): Mock {
  const calls: Recorded[] = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);

    calls.push({ method: body.method, params: body.params, headers: (init?.headers ?? {}) as Record<string, string> });
    if (era === 'legacy' && body.params?._meta) {
      return Response.json(
        { jsonrpc: '2.0', id: body.id, error: { code: -32600, message: 'Server not initialized' } },
        { status: 400 },
      );
    }
    const result =
      body.method === 'tools/list' ? { tools } : body.method === 'tools/call' ? { content: [{ type: 'text', text: 'ok' }] } : {};

    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  };

  return { calls, fetchImpl };
}

/** A server that always answers with the given status and body. */
const answering = (status: number, body: unknown) => async () => Response.json(body, { status });

const remote = createJanuxServer({
  title: 'Remote App',
  routes: { '/': () => jsx('main', { children: 'remote' }) },
  apis: {
    remote: {
      hello: api({ description: 'Say hello', input: schema({ name: str() }), run: ({ input }) => `hola ${input.name}` }),
      nuke: api({ description: 'Never for agents', guard: 'forbidden', run: () => 'boom' }),
    },
  },
});

/** Routes the client's fetch straight into a real Janux server. */
const loopback = (url: string, init?: RequestInit) => remote.fetch(new Request(url, init));

export const MCP_CLIENT_CASES: ScenarioCase[] = [
  // ── discovery and naming ────────────────────────────────────────────────────
  {
    id: 'harness2-mcp-client-lists-the-remote-tools',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: mock('modern').fetchImpl });

      log.push((await connection.tools()).map((tool) => tool.name).join(','));
    },
    expected: ['search'],
  },
  {
    id: 'harness2-mcp-client-namespaces-remote-tools-so-they-cannot-collide',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', namespace: 'didit', fetchImpl: mock('modern').fetchImpl });

      log.push((await connection.tools()).map((tool) => tool.name).join(','));
    },
    expected: ['didit.search'],
  },
  {
    id: 'harness2-mcp-client-strips-the-namespace-before-the-name-goes-on-the-wire',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');
      const connection = connectMcp({ url: 'https://remote/mcp', namespace: 'didit', fetchImpl: server.fetchImpl });

      await connection.tools();
      await connection.call('didit.search', { q: 'x' });
      log.push(server.calls[1]!.params.name);
    },
    expected: ['search'],
  },
  {
    id: 'harness2-mcp-client-carries-the-remote-description-through',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: mock('modern').fetchImpl });

      log.push(String((await connection.tools())[0]!.description));
    },
    expected: ['Search the corpus'],
  },
  {
    id: 'harness2-mcp-client-gives-a-description-less-remote-tool-an-empty-one',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: mock('modern', [{ name: 'bare' }]).fetchImpl });

      log.push(JSON.stringify((await connection.tools())[0]!.description));
    },
    expected: ['""'],
  },
  {
    id: 'harness2-mcp-client-passes-the-remote-input-schema-to-the-model-unchanged',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: mock('modern').fetchImpl });

      log.push(JSON.stringify((await connection.tools())[0]!.input));
    },
    expected: ['{"type":"object","properties":{"q":{"type":"string"}}}'],
  },
  {
    id: 'harness2-mcp-client-a-remote-tool-can-be-called-through-its-own-handle',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');
      const connection = connectMcp({ url: 'https://remote/mcp', namespace: 'didit', fetchImpl: server.fetchImpl });
      const [tool] = await connection.tools();

      await tool!.call({ q: 'direct' });
      log.push(`${server.calls[1]!.method} ${server.calls[1]!.params.name}`);
    },
    expected: ['tools/call search'],
  },
  {
    id: 'harness2-mcp-client-a-server-with-no-tools-yields-an-empty-toolbox',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: mock('modern', []).fetchImpl });

      log.push(String((await connection.tools()).length));
    },
    expected: ['0'],
  },
  {
    id: 'harness2-mcp-client-a-server-that-omits-the-tool-list-is-not-a-crash',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: async () => Response.json({ jsonrpc: '2.0', id: 1, result: {} }) });

      log.push(String((await connection.tools()).length));
    },
    expected: ['0'],
  },
  {
    id: 'harness2-mcp-client-sends-empty-arguments-rather-than-none',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.call('search', undefined);
      log.push(JSON.stringify(server.calls[0]!.params.arguments));
    },
    expected: ['{}'],
  },

  // ── the modern era, per request ─────────────────────────────────────────────
  {
    id: 'harness2-mcp-client-speaks-the-modern-era-first-with-no-handshake',
    src: 'mcp:2026-07-28#per-request',
    run: async (log) => {
      const server = mock('modern');
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      log.push(server.calls.map((call) => call.method).join(','));
    },
    expected: ['tools/list'],
  },
  {
    id: 'harness2-mcp-client-mirrors-the-protocol-version-in-a-header-and-in-the-meta',
    src: 'mcp:2026-07-28#mirrored-headers',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      const [call] = server.calls;

      log.push(`${call!.headers['mcp-protocol-version']} ${call!.params._meta[`${META}protocolVersion`]}`);
    },
    expected: [`${MODERN} ${MODERN}`],
  },
  {
    id: 'harness2-mcp-client-mirrors-the-method-in-a-header',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      log.push(server.calls[0]!.headers['mcp-method']!);
    },
    expected: ['tools/list'],
  },
  {
    id: 'harness2-mcp-client-mirrors-the-tool-name-on-a-call',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).call('search', { q: 'x' });
      log.push(server.calls[0]!.headers['mcp-name']!);
    },
    expected: ['search'],
  },
  {
    id: 'harness2-mcp-client-sends-no-name-header-when-the-method-has-no-name',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      log.push(`name=${'mcp-name' in server.calls[0]!.headers}`);
    },
    expected: ['name=false'],
  },
  {
    id: 'harness2-mcp-client-introduces-itself-in-the-request-meta',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      log.push(JSON.stringify(server.calls[0]!.params._meta[`${META}clientInfo`]));
    },
    expected: ['{"name":"janux-agent","version":"1"}'],
  },
  {
    id: 'harness2-mcp-client-declares-its-capabilities-in-the-request-meta',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      log.push(JSON.stringify(server.calls[0]!.params._meta[`${META}clientCapabilities`]));
    },
    expected: ['{}'],
  },
  {
    id: 'harness2-mcp-client-asks-for-json-and-event-streams',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      log.push(server.calls[0]!.headers.accept!);
    },
    expected: ['application/json, text/event-stream'],
  },
  {
    id: 'harness2-mcp-client-forwards-the-users-bearer-token',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', token: 'u-1', fetchImpl: server.fetchImpl }).tools();
      log.push(server.calls[0]!.headers.authorization!);
    },
    expected: ['Bearer u-1'],
  },
  {
    id: 'harness2-mcp-client-sends-no-authorization-for-a-public-server',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      log.push(`authorization=${'authorization' in server.calls[0]!.headers}`);
    },
    expected: ['authorization=false'],
  },
  {
    id: 'harness2-mcp-client-gives-every-message-its-own-id',
    src: 'janux',
    run: async (log) => {
      const ids: unknown[] = [];
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init!.body as string);

          ids.push(body.id);

          return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools: [] } });
        },
      });

      await connection.tools();
      await connection.tools();
      log.push(`distinct=${ids[0] !== ids[1]}`);
    },
    expected: ['distinct=true'],
  },

  // ── header-mirrored parameters ──────────────────────────────────────────────
  {
    id: 'harness2-mcp-client-mirrors-an-annotated-parameter-into-a-header',
    src: 'mcp:2026-07-28#param-headers',
    run: async (log) => {
      const annotated = {
        name: 'search',
        inputSchema: { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' }, q: { type: 'string' } } },
      };
      const server = mock('modern', [annotated]);
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      await connection.call('search', { region: 'us-west1', q: 'janux' });
      log.push(`${server.calls[1]!.headers['mcp-param-region']} q=${'mcp-param-q' in server.calls[1]!.headers}`);
    },
    expected: ['us-west1 q=false'],
  },
  {
    id: 'harness2-mcp-client-sentinel-encodes-a-header-value-that-is-not-header-safe',
    src: 'mcp:2026-07-28#sentinel',
    run: async (log) => {
      const annotated = {
        name: 'search',
        inputSchema: { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } },
      };
      const server = mock('modern', [annotated]);
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      await connection.call('search', { region: 'ürtümbia' });
      const expected = `=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode('ürtümbia')))}?=`;

      log.push(`${server.calls[1]!.headers['mcp-param-region'] === expected}`);
    },
    expected: ['true'],
  },
  {
    id: 'harness2-mcp-client-omits-a-mirrored-header-the-caller-did-not-supply',
    src: 'janux',
    run: async (log) => {
      const annotated = {
        name: 'search',
        inputSchema: { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } },
      };
      const server = mock('modern', [annotated]);
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      await connection.call('search', {});
      log.push(`region=${'mcp-param-region' in server.calls[1]!.headers}`);
    },
    expected: ['region=false'],
  },
  {
    id: 'harness2-mcp-client-mirrors-nothing-for-a-tool-it-never-discovered',
    src: 'janux',
    run: async (log) => {
      const server = mock('modern');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).call('unseen', { region: 'us' });
      log.push(`region=${'mcp-param-region' in server.calls[0]!.headers}`);
    },
    expected: ['region=false'],
  },

  // ── falling back to the legacy era ──────────────────────────────────────────
  {
    id: 'harness2-mcp-client-falls-back-to-the-handshake-when-a-server-refuses-the-modern-shape',
    src: 'mcp:2026-07-28#fallback',
    run: async (log) => {
      const server = mock('legacy');
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      log.push(server.calls.map((call) => call.method).join(','));
    },
    expected: ['tools/list,initialize,tools/list'],
  },
  {
    id: 'harness2-mcp-client-still-gets-the-tools-from-a-legacy-server',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: mock('legacy').fetchImpl });

      log.push((await connection.tools()).map((tool) => tool.name).join(','));
    },
    expected: ['search'],
  },
  {
    id: 'harness2-mcp-client-sends-no-modern-meta-once-it-knows-the-server-is-old',
    src: 'janux',
    run: async (log) => {
      const server = mock('legacy');
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      log.push(`meta=${server.calls.at(-1)!.params?._meta !== undefined}`);
    },
    expected: ['meta=false'],
  },
  {
    id: 'harness2-mcp-client-negotiates-the-old-protocol-version-in-the-handshake',
    src: 'janux',
    run: async (log) => {
      const server = mock('legacy');

      await connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl }).tools();
      const handshake = server.calls.find((call) => call.method === 'initialize');

      log.push(handshake!.params.protocolVersion);
    },
    expected: ['2025-06-18'],
  },
  {
    id: 'harness2-mcp-client-shakes-hands-once-for-the-lifetime-of-the-connection',
    src: 'janux',
    run: async (log) => {
      const server = mock('legacy');
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      await connection.tools();
      log.push(`handshakes=${server.calls.filter((call) => call.method === 'initialize').length}`);
    },
    expected: ['handshakes=1'],
  },
  {
    id: 'harness2-mcp-client-stops-trying-the-modern-shape-after-the-first-refusal',
    src: 'janux',
    run: async (log) => {
      const server = mock('legacy');
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: server.fetchImpl });

      await connection.tools();
      await connection.tools();
      log.push(`attempts=${server.calls.filter((call) => call.params?._meta).length}`);
    },
    expected: ['attempts=1'],
  },
  {
    id: 'harness2-mcp-client-never-retries-a-modern-era-refusal-as-if-it-were-legacy',
    src: 'janux',
    run: async (log) => {
      const calls: string[] = [];
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async (_url, init) => {
          calls.push(JSON.parse(init!.body as string).method);

          return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32020, message: 'Header mismatch' } }, { status: 400 });
        },
      });

      await attempt(log, 'tools', () => connection.tools());
      log.push(`attempts=${calls.length}`);
    },
    expected: ['tools:threw:mcp_http_400', 'attempts=1'],
  },
  {
    id: 'harness2-mcp-client-never-retries-an-unsupported-version-refusal-either',
    src: 'janux',
    run: async (log) => {
      const calls: string[] = [];
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async (_url, init) => {
          calls.push(JSON.parse(init!.body as string).method);

          return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32022, message: 'Unsupported' } }, { status: 400 });
        },
      });

      await attempt(log, 'tools', () => connection.tools());
      log.push(`attempts=${calls.length}`);
    },
    expected: ['tools:threw:mcp_http_400', 'attempts=1'],
  },
  {
    id: 'harness2-mcp-client-once-modern-always-modern-even-if-a-later-call-400s',
    src: 'janux',
    run: async (log) => {
      let answered = 0;
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init!.body as string);

          answered += 1;
          if (answered === 1) return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools: [] } });

          return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32600, message: 'nope' } }, { status: 400 });
        },
      });

      await connection.tools();
      await attempt(log, 'second', () => connection.tools());
      log.push(`requests=${answered}`);
    },
    expected: ['second:threw:mcp_http_400', 'requests=2'],
  },

  // ── failures the agent has to survive ───────────────────────────────────────
  {
    id: 'harness2-mcp-client-reports-an-http-failure-by-its-status',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl: answering(502, { error: 'bad gateway' }) });

      await attempt(log, 'tools', () => connection.tools());
    },
    expected: ['tools:threw:mcp_http_502'],
  },
  {
    id: 'harness2-mcp-client-reports-a-json-rpc-error-by-its-code',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }),
      });

      await attempt(log, 'tools', () => connection.tools());
    },
    expected: ['tools:threw:mcp_error_-32601: Method not found'],
  },
  {
    id: 'harness2-mcp-client-reads-a-single-response-delivered-as-an-event-stream',
    src: 'mcp:streamable-http#sse',
    run: async (log) => {
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async () =>
          new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [TOOL] } })}\n\n`, {
            headers: { 'content-type': 'text/event-stream' },
          }),
      });

      log.push((await connection.tools()).map((tool) => tool.name).join(','));
    },
    expected: ['search'],
  },
  {
    id: 'harness2-mcp-client-reassembles-an-event-stream-split-across-data-lines',
    src: 'janux',
    run: async (log) => {
      const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [TOOL] } });
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async () =>
          new Response(`data: ${payload.slice(0, 10)}\ndata: ${payload.slice(10)}\n\n`, {
            headers: { 'content-type': 'text/event-stream' },
          }),
      });

      log.push(String((await connection.tools()).length));
    },
    expected: ['1'],
  },
  {
    id: 'harness2-mcp-client-treats-an-empty-event-stream-as-no-result',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({
        url: 'https://remote/mcp',
        fetchImpl: async () => new Response('', { headers: { 'content-type': 'text/event-stream' } }),
      });

      log.push(String((await connection.tools()).length));
    },
    expected: ['0'],
  },

  // ── the per-user connection pool ────────────────────────────────────────────
  {
    id: 'harness2-mcp-pool-hands-the-same-caller-the-same-connection',
    src: 'janux',
    run: (log) => {
      const pool = createMcpPool();
      const options = { url: 'https://remote/mcp', fetchImpl: mock('modern').fetchImpl };

      log.push(`same=${pool.get('user-1', options) === pool.get('user-1', options)} size=${pool.size()}`);
    },
    expected: ['same=true size=1'],
  },
  {
    id: 'harness2-mcp-pool-keeps-one-connection-per-caller',
    src: 'janux',
    run: (log) => {
      const pool = createMcpPool();
      const options = { url: 'https://remote/mcp', fetchImpl: mock('modern').fetchImpl };

      pool.get('user-1', options);
      pool.get('user-2', options);
      log.push(`size=${pool.size()}`);
    },
    expected: ['size=2'],
  },
  {
    id: 'harness2-mcp-pool-evicts-a-connection-whose-discovery-failed',
    src: 'janux',
    run: async (log) => {
      const pool = createMcpPool();
      const connection = pool.get('user-1', { url: 'https://remote/mcp', fetchImpl: answering(502, {}) });

      await attempt(log, 'tools', () => connection.tools());
      log.push(`size=${pool.size()}`);
    },
    expected: ['tools:threw:mcp_http_502', 'size=0'],
  },
  {
    id: 'harness2-mcp-pool-evicts-a-connection-whose-call-hit-a-transport-error',
    src: 'janux',
    run: async (log) => {
      const pool = createMcpPool();
      const connection = pool.get('user-1', { url: 'https://remote/mcp', fetchImpl: answering(500, {}) });

      await attempt(log, 'call', () => connection.call('search', {}));
      log.push(`size=${pool.size()}`);
    },
    expected: ['call:threw:mcp_http_500', 'size=0'],
  },
  {
    id: 'harness2-mcp-pool-keeps-a-connection-that-merely-refused-a-call',
    src: 'janux',
    run: async (log) => {
      const pool = createMcpPool();
      const connection = pool.get('user-1', {
        url: 'https://remote/mcp',
        fetchImpl: async () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params' } }),
      });

      await attempt(log, 'call', () => connection.call('search', {}));
      log.push(`size=${pool.size()}`);
    },
    expected: ['call:threw:mcp_error_-32602: Invalid params', 'size=1'],
  },
  {
    id: 'harness2-mcp-pool-lets-a-caller-be-evicted-by-hand',
    src: 'janux',
    run: (log) => {
      const pool = createMcpPool();

      pool.get('user-1', { url: 'https://remote/mcp', fetchImpl: mock('modern').fetchImpl });
      log.push(`evicted=${pool.evict('user-1')} size=${pool.size()}`);
    },
    expected: ['evicted=true size=0'],
  },
  {
    id: 'harness2-mcp-pool-evicting-a-caller-it-never-had-is-not-an-error',
    src: 'janux',
    run: (log) => log.push(`evicted=${createMcpPool().evict('nobody')}`),
    expected: ['evicted=false'],
  },
  {
    id: 'harness2-mcp-pool-starts-empty',
    src: 'janux',
    run: (log) => log.push(`size=${createMcpPool().size()}`),
    expected: ['size=0'],
  },

  // ── against a real Janux hosted MCP ─────────────────────────────────────────
  {
    id: 'harness2-mcp-client-round-trips-against-a-real-janux-server',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'http://remote/_janux/mcp', fetchImpl: loopback, namespace: 'didit' });
      const result = (await connection.call('didit.remote.hello', { name: 'ada' })) as { content: { text: string }[] };

      log.push(result.content[0]!.text);
    },
    expected: ['"hola ada"'],
  },
  {
    id: 'harness2-mcp-client-sees-the-tools-a-real-janux-server-advertises',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'http://remote/_janux/mcp', fetchImpl: loopback, namespace: 'didit' });

      log.push((await connection.tools()).map((tool) => tool.name).join(','));
    },
    expected: ['didit.remote.hello'],
  },
  {
    id: 'harness2-mcp-client-is-never-offered-a-tool-the-remote-app-closed-to-agents',
    src: 'janux',
    run: async (log) => {
      const connection = connectMcp({ url: 'http://remote/_janux/mcp', fetchImpl: loopback });
      const names = (await connection.tools()).map((tool) => tool.name);

      log.push(`nuke=${names.includes('remote.nuke')}`);
    },
    expected: ['nuke=false'],
  },
  {
    id: 'harness2-mcp-client-and-a-real-janux-server-agree-on-the-modern-era',
    src: 'janux',
    run: async (log) => {
      const seen: string[] = [];
      const watched = (url: string, init?: RequestInit) => {
        seen.push(JSON.parse(init!.body as string).method);

        return loopback(url, init);
      };
      const connection = connectMcp({ url: 'http://remote/_janux/mcp', fetchImpl: watched });

      await connection.tools();
      log.push(seen.join(','));
    },
    expected: ['tools/list'],
  },
];
