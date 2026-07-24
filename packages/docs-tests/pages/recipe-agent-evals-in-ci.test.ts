import { describe, expect, it } from 'bun:test';
import { api, createJanuxServer } from '@janux/server';
import { defineAgent } from '@janux/agent';
import { schema, str } from 'janux';
import { docExample } from '../doc-example';

/**
 * recipes/agent-evals-in-ci.md, layer by layer. Layer 1's helper is extracted
 * from the page and used to drive the real loop. Layer 3 needs a key and a live
 * app, so what runs here is the SHAPE its assertions rely on — the ui_calls
 * envelope and the proposal-as-tool-result — driven by a scripted model, so the
 * page can't teach an assertion that no longer matches the runtime.
 */

const toolUse = (name: string, input: unknown) => ({ type: 'tool_use', id: `t_${name}`, name, input });

const ask = (server: { fetch(request: Request): Promise<Response> }, content: string) =>
  server.fetch(
    new Request('http://test/_janux/agent', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content }] }),
      headers: { 'content-type': 'application/json' },
    }),
  );

function scriptedAgent(replies: Response[]) {
  const fetchImpl = (async () => replies.shift()!) as unknown as typeof fetch;

  return defineAgent({}, { env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl });
}

/** The page's own helpers, extracted — if they stop working, the page is wrong. */
const layerOne = await docExample('apps/docs/content/recipes/agent-evals-in-ci.md', 0);
const anthropicReply = layerOne.reply as (content: unknown[]) => Response;

describe('recipes/agent-evals-in-ci.md — layer 1 (scripted model)', () => {
  it("the page's scriptedServer really drives the loop through a server tool", async () => {
    const server = layerOne.scriptedServer([
      anthropicReply([toolUse('api__shop__search', { q: 'shoes' })]),
      anthropicReply([{ type: 'text', text: 'Found 1 result' }]),
    ]);
    const body: any = await (await ask(server, 'find shoes')).json();

    expect(body.type).toBe('text');
    expect(body.text).toBe('Found 1 result');
    expect(JSON.stringify(body.messages)).toContain('found:shoes');
  });
});

describe('recipes/agent-evals-in-ci.md — layer 3 assertion shapes', () => {
  const server = () =>
    createJanuxServer({
      apis: {
        shop: {
          pay: api({
            description: 'Charge the card. Irreversible.',
            input: schema({ total: str() }),
            guard: 'confirm',
            run: ({ input }) => ({ charged: input.total }),
          }),
        },
      },
      agent: scriptedAgent([anthropicReply([toolUse('cart__addItem', { productId: 'p1', qty: 2 })])]),
    });

  it('a UI tool comes back as { type: "ui_calls" } with the model\'s input', async () => {
    const body: any = await (await ask(server(), 'add two p1')).json();

    expect(body.type).toBe('ui_calls');
    expect(body.calls[0]).toMatchObject({ name: 'cart.addItem', input: { productId: 'p1', qty: 2 } });
  });

  it('a confirm-guarded api() surfaces as a proposal in the tool results', async () => {
    const withPay = createJanuxServer({
      apis: {
        shop: {
          pay: api({
            description: 'Charge the card. Irreversible.',
            input: schema({ total: str() }),
            guard: 'confirm',
            run: () => ({ charged: true }),
          }),
        },
      },
      agent: scriptedAgent([
        anthropicReply([toolUse('api__shop__pay', { total: '5999' })]),
        anthropicReply([{ type: 'text', text: 'I need your confirmation.' }]),
      ]),
    });
    const body: any = await (await ask(withPay, 'pay 5999')).json();
    const results = (body.messages ?? []).filter((message: any) => message.role === 'tool');

    // The page tells readers to parse this: a tool result travels as a JSON string.
    expect(JSON.parse(results[0].content)).toMatchObject({ status: 'proposal', tool: 'shop.pay' });
  });
});
