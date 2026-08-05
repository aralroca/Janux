import { describe, expect, it } from 'bun:test';
import { jsx, schema, str } from 'janux';
import { api } from './api';
import { createJanuxServer } from './server';

/**
 * Elicitation (2026-07-28) mapped onto proposals.
 *
 * The spec's own mechanism is multi round-trip: the server answers
 * `input_required` and the client retries the same call carrying what it
 * gathered. Janux already parks a `confirm` call for a human and already
 * records what came of it — so the whole feature is a projection of the vault
 * onto the wire, and these tests assert that nothing about the guard, the
 * audit trail or the older era moved to make room for it.
 */

const audited: { tool: string; origin: string; guard: string; ok?: boolean; proposed?: boolean }[] = [];

/** A parked proposal is audited too (`proposed: true`) — "it ran" is the entry without it. */
const executions = (tool: string) => audited.filter((entry) => entry.tool === tool && entry.ok && !entry.proposed);

const apis = {
  greet: api({ description: 'Greet', input: schema({ name: str() }), run: ({ input }) => `hola ${input.name}` }),
  refund: api({
    description: 'Refund an order',
    guard: 'confirm',
    input: schema({ order: str() }),
    run: ({ input }) => `refunded ${input.order}`,
  }),
  secret: api({ description: 'Never for agents', guard: 'forbidden', run: () => 'nope' }),
};

function server() {
  return createJanuxServer({
    title: 'shop',
    apis: { shop: apis },
    routes: { '/': () => jsx('main', { children: 'Home' }) },
    onAudit: (entry: any) => audited.push(entry),
  });
}

const MODERN = '2026-07-28';
const META = 'io.modelcontextprotocol/';

/** A modern request, with whatever capabilities this client wants to claim. */
function modernCall(params: Record<string, unknown>, capabilities: unknown = { elicitation: { url: {} } }) {
  const withMeta = {
    ...params,
    _meta: { [`${META}protocolVersion`]: MODERN, [`${META}clientCapabilities`]: capabilities },
  };

  return {
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: withMeta },
    headers: {
      'mcp-protocol-version': MODERN,
      'mcp-method': 'tools/call',
      'mcp-name': String(params.name),
    },
  };
}

async function post(target: ReturnType<typeof server>, body: unknown, headers: Record<string, string> = {}) {
  const res = await target.fetch(
    new Request('http://x/_janux/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

  return { status: res.status, body: await res.json() };
}

const callRefund = (target: ReturnType<typeof server>, extra: Record<string, unknown> = {}, capabilities?: unknown) => {
  const { body, headers } = modernCall({ name: 'shop.refund', arguments: { order: 'A-1' }, ...extra }, capabilities);

  return post(target, body, headers);
};

/** The human half: open the page the elicitation pointed at, then settle it there. */
async function settleInBrowser(target: ReturnType<typeof server>, url: string, decision: 'approve' | 'reject') {
  const page = await target.fetch(new Request(url, { headers: { accept: 'text/html', cookie: 'sid=human' } }));
  const token = new URL(url).searchParams.get('token') ?? '';
  const settled = await target.fetch(
    new Request('http://x/_janux/elicit/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://x', cookie: 'sid=human' },
      body: new URLSearchParams({ token, decision }),
    }),
  );

  return { page, settled };
}

describe('MCP elicitation over proposals', () => {
  it('answers a confirm-guarded call with input_required, not with a blob of prose', async () => {
    const { body } = await callRefund(server());
    const { result } = body;
    const request = Object.values(result.inputRequests)[0] as any;

    expect(result.resultType).toBe('input_required');
    expect(request.method).toBe('elicitation/create');
    expect(request.params.mode).toBe('url');
    expect(request.params.url).toContain('/_janux/elicit?token=');
    expect(typeof result.requestState).toBe('string');
  });

  it('runs nothing until a human says so', async () => {
    audited.length = 0;
    await callRefund(server());

    expect(executions('api.shop.refund')).toEqual([]);
  });

  it('keeps the older era on the answer it already had', async () => {
    const { body } = await post(server(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'shop.refund', arguments: { order: 'A-1' } },
    });

    expect(body.result.resultType).toBe('complete');
    expect(JSON.parse(body.result.content[0].text).status).toBe('proposal');
  });

  it('does not elicit from a client that never said it could be elicited from', async () => {
    const { body } = await callRefund(server(), {}, {});

    expect(body.result.resultType).toBe('complete');
    expect(JSON.parse(body.result.content[0].text).status).toBe('proposal');
  });

  it('never elicits for a tool that needs no confirmation', async () => {
    const { body: modern } = modernCall({ name: 'shop.greet', arguments: { name: 'ada' } });
    const { body } = await post(server(), modern, {
      'mcp-protocol-version': MODERN,
      'mcp-method': 'tools/call',
      'mcp-name': 'shop.greet',
    });

    expect(body.result.resultType).toBe('complete');
    expect(body.result.content[0].text).toContain('hola ada');
  });

  it('asks again, with the same state, while the human has not answered', async () => {
    const target = server();
    const { body: first } = await callRefund(target);
    const { body: second } = await callRefund(target, {
      requestState: first.result.requestState,
      inputResponses: { approval: { action: 'accept' } },
    });

    expect(second.result.resultType).toBe('input_required');
    expect(second.result.requestState).toBe(first.result.requestState);
  });

  it('completes the call once the human approved it in the browser', async () => {
    const target = server();
    const { body: first } = await callRefund(target);
    const url = (Object.values(first.result.inputRequests)[0] as any).params.url;
    const { page, settled } = await settleInBrowser(target, url, 'approve');

    expect(page.status).toBe(200);
    expect(settled.status).toBe(200);

    const { body: second } = await callRefund(target, {
      requestState: first.result.requestState,
      inputResponses: { approval: { action: 'accept' } },
    });

    expect(second.result.resultType).toBe('complete');
    expect(second.result.content[0].text).toContain('refunded A-1');
  });

  it('reports a refusal as a refusal, not as a result', async () => {
    const target = server();
    const { body: first } = await callRefund(target);
    const url = (Object.values(first.result.inputRequests)[0] as any).params.url;

    await settleInBrowser(target, url, 'reject');
    const { body: second } = await callRefund(target, {
      requestState: first.result.requestState,
      inputResponses: { approval: { action: 'accept' } },
    });

    expect(second.result.isError).toBe(true);
    expect(second.result.resultType).toBe('complete');
  });

  it('drops the proposal when the client reports the user declined', async () => {
    const target = server();
    const { body: first } = await callRefund(target);
    const url = (Object.values(first.result.inputRequests)[0] as any).params.url;
    const { body: second } = await callRefund(target, {
      requestState: first.result.requestState,
      inputResponses: { approval: { action: 'decline' } },
    });

    expect(second.result.isError).toBe(true);

    const { page } = await settleInBrowser(target, url, 'approve');

    expect(page.status).toBe(404);
  });

  it('refuses a request state the client edited', async () => {
    const target = server();

    audited.length = 0;
    const { body: first } = await callRefund(target);
    const [id] = String(first.result.requestState).split('.');
    const { body: second } = await callRefund(target, {
      requestState: `${id}.forged-signature`,
      inputResponses: { approval: { action: 'accept' } },
    });

    expect(second.result.isError).toBe(true);
    expect(executions('api.shop.refund')).toEqual([]);
  });

  it('still refuses a forbidden tool, elicitation or not', async () => {
    const { body: forbidden } = modernCall({ name: 'shop.secret', arguments: {} });
    const { body } = await post(server(), forbidden, {
      'mcp-protocol-version': MODERN,
      'mcp-method': 'tools/call',
      'mcp-name': 'shop.secret',
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.resultType).toBe('complete');
  });
});
