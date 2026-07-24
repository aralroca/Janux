import { describe, expect, it } from 'bun:test';
import { defineAgent } from '@janux/agent';
import { api, createJanuxServer } from '@janux/server';
import { schema, str } from 'janux';

/**
 * guide/agent-and-copilot.md — the turn protocol, asserted with a scripted
 * provider: a setup card without a key, api.* tools executed server-side inside
 * the loop, ui.* tools handed back for the browser, the turn limit, and the
 * `tools.include` allowlist the page documents.
 */

const reply = (content: unknown[]) =>
  new Response(JSON.stringify({ content, model: 'claude-sonnet-5' }), {
    headers: { 'content-type': 'application/json' },
  });

const toolUse = (name: string, input: unknown = {}) => ({ type: 'tool_use', id: `t_${name}`, name, input });

function app(replies: Response[], config: Record<string, unknown> = {}) {
  const fetchImpl = (async () => replies.shift() ?? reply([{ type: 'text', text: 'done' }])) as unknown as typeof fetch;

  return createJanuxServer({
    apis: {
      shop: {
        search: api({ description: 'Search', input: schema({ q: str() }), run: ({ input }: any) => [`found:${input.q}`] }),
        secret: api({ description: 'Internal', guard: 'forbidden', run: () => 'nope' }),
      },
    },
    agent: defineAgent(config as any, { env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl }),
  });
}

const ask = (server: { fetch(request: Request): Promise<Response> }, content = 'hi') =>
  server
    .fetch(
      new Request('http://test/_janux/agent', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ role: 'user', content }] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    .then((response) => response.json() as any);

describe('guide/agent-and-copilot.md — the turn protocol', () => {
  it('answers a setup card when no model is configured, and the app still works', async () => {
    const server = createJanuxServer({ agent: defineAgent({}, { env: {} }) });
    const body = await ask(server);

    expect(body.type).toBe('setup');
    expect(body.message).toContain('JANUX_MODEL');
  });

  it('executes api.* tools server-side inside the loop and reports the model', async () => {
    const body = await ask(app([reply([toolUse('api__shop__search', { q: 'shoes' })]), reply([{ type: 'text', text: 'Found 1' }])]));

    expect(body).toMatchObject({ type: 'text', text: 'Found 1', model: 'anthropic/claude-sonnet-5' });
    expect(JSON.stringify(body.messages)).toContain('found:shoes');
  });

  it('hands ui.* tools back to the browser instead of executing them', async () => {
    const body = await ask(app([reply([toolUse('cart__addItem', { productId: 'p1', qty: 2 })])]));

    expect(body.type).toBe('ui_calls');
    expect(body.calls[0]).toMatchObject({ name: 'cart.addItem', input: { productId: 'p1', qty: 2 } });
  });

  it('stops at maxTurns instead of looping forever', async () => {
    const server = app([reply([toolUse('api__shop__search', { q: 'a' })]), reply([toolUse('api__shop__search', { q: 'b' })])], {
      maxTurns: 1,
    });
    const body = await ask(server);

    expect(body.text).toContain('could not finish');
  });

  it('tools.include narrows what the model is offered', async () => {
    const server = app([reply([{ type: 'text', text: 'ok' }])], { tools: { include: ['api.shop.search'] } });
    let offered: string[] = [];
    const spy = createJanuxServer({
      apis: { shop: { search: api({ description: 'Search', run: () => [] }), other: api({ description: 'Other', run: () => [] }) } },
      agent: defineAgent(
        { tools: { include: ['api.shop.search'] } },
        {
          env: { ANTHROPIC_API_KEY: 'sk-test' },
          fetchImpl: (async (_url: string, init: any) => {
            offered = JSON.parse(init.body).tools.map((tool: any) => tool.name);

            return reply([{ type: 'text', text: 'ok' }]);
          }) as unknown as typeof fetch,
        },
      ),
    });

    await ask(spy);
    await ask(server);

    expect(offered).toContain('api__shop__search');
    expect(offered).not.toContain('api__shop__other');
  });

  it('never offers a forbidden tool to the model', async () => {
    let offered: string[] = [];
    const server = createJanuxServer({
      apis: { shop: { secret: api({ description: 'Internal', guard: 'forbidden', run: () => 'nope' }) } },
      agent: defineAgent(
        {},
        {
          env: { ANTHROPIC_API_KEY: 'sk-test' },
          fetchImpl: (async (_url: string, init: any) => {
            offered = JSON.parse(init.body).tools.map((tool: any) => tool.name);

            return reply([{ type: 'text', text: 'ok' }]);
          }) as unknown as typeof fetch,
        },
      ),
    });

    await ask(server);

    // The six built-in client tools are always there (the page's own table);
    // the forbidden api is what the model never sees.
    expect(offered).toEqual(['ui_navigate', 'ui_get_view_context', 'ui_read_page', 'ui_click', 'ui_fill', 'ui_wait_settled']);
    expect(offered).not.toContain('api__shop__secret');
  });
});
