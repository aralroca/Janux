import { afterEach, describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { defineAgent } from '@janux/agent';
import { defaultPiiFilter, otelTracer, setOnError, setPiiFilter, setTracer } from 'janux/observability';
import { recordingTracer } from '../../janux/src/observability/__fixtures__/recording-tracer';

/**
 * recipes/sentry.md claims a specific trace — three requests tied together by
 * one proposal id. The ASCII tree in that page is not decoration: this runs the
 * scenario and asserts the framework really emits those spans, with those
 * attributes, in that order. If the trace changes, the recipe fails.
 */

afterEach(() => {
  setTracer(undefined);
  setOnError(undefined);
  setPiiFilter(undefined);
});

const cart = component({
  name: 'cart',
  description: 'The shopping cart',
  state: schema({ last: str() }),
  intents: { clear: intent({ description: 'Empty the cart', run: () => undefined }) },
  view: () => jsx('p', { children: 'cart' }),
});

const checkout = api({
  description: 'Place the order. Irreversible.',
  guard: 'confirm',
  input: schema({ sku: str() }),
  run: ({ input }) => ({ ordered: (input as { sku: string }).sku }),
});

function anthropicReply(blocks: unknown[]): Response {
  const usage = { input_tokens: 1200, output_tokens: 300 };

  return new Response(JSON.stringify({ content: blocks, model: 'claude-fable-5-20260501', usage }), { status: 200 });
}

/** The agent asks for the guarded tool, then answers once it has the proposal back. */
function scriptedModel() {
  const replies = [
    anthropicReply([{ type: 'tool_use', id: 'c1', name: 'api__shop__checkout', input: { sku: 'JX-1' } }]),
    anthropicReply([{ type: 'text', text: 'Waiting for your approval.' }]),
  ];

  return async () => replies.shift() ?? anthropicReply([{ type: 'text', text: 'done' }]);
}

function buildApp() {
  const agent = defineAgent(
    // The pricing block the recipe shows: USD per MILLION tokens.
    { model: 'anthropic/claude-fable-5', cost: { input: 3, output: 15 } },
    { env: { ANTHROPIC_API_KEY: 'sk-a' }, fetchImpl: scriptedModel() },
  );

  return createJanuxServer({ routes: { '/': () => jsx(cart as any, {}) }, apis: { shop: { checkout } }, agent });
}

const post = (server: ReturnType<typeof buildApp>, path: string, body: unknown) =>
  server.fetch(
    new Request(`http://x${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    }),
  );

describe('recipes/sentry.md — the register() the page shows', () => {
  it('installs a tracer, an error sink and a PII filter before anything serves', async () => {
    const spans: string[] = [];
    const register = async () => {
      setTracer(otelTracer({ startActiveSpan: (name, _options, run) => (spans.push(name), run(otelSpan())) }));
      setOnError(() => undefined);
      setPiiFilter((value) => defaultPiiFilter(value).replace(/cus_\w+/g, '[customer]'));
    };

    await register();
    await (await buildApp().fetch(new Request('http://x/'))).text();

    expect(spans).toContain('janux.render');
  });
});

function otelSpan() {
  return {
    setAttributes: () => undefined,
    recordException: () => undefined,
    setStatus: () => undefined,
    end: () => undefined,
  };
}

describe('recipes/sentry.md — the trace the page prints', () => {
  it('emits exactly the documented sequence, tied together by one proposal id', async () => {
    const tracer = recordingTracer();
    const server = buildApp();

    setTracer(tracer);
    await (await server.fetch(new Request('http://x/'))).text();
    // The signed token rides only the agent's reply — the span carries the bare
    // id, which by design no longer approves anything.
    const turn = await (await post(server, '/_janux/agent', { messages: [{ role: 'user', content: 'check out' }], path: '/' })).text();
    const [id] = turn.match(/prop_api_[0-9a-f-]{36}\.[A-Za-z0-9_-]+/)!;

    await post(server, '/_janux/approve', { id });

    expect(tracer.names()).toEqual([
      'janux.request',
      'janux.render',
      'janux.island',
      'janux.request',
      'janux.render',
      'janux.island',
      'invoke_agent janux',
      'chat claude-fable-5',
      'janux.api',
      'chat claude-fable-5',
      'janux.request',
      'janux.proposal.approve',
      'janux.api.execute',
    ]);

    expect(tracer.spans[0]!.attributes).toMatchObject({ 'http.request.method': 'GET', 'janux.route': '/' });
    expect(tracer.spans[2]!.attributes['janux.island']).toBe('cart');
  });

  it('prices the turn at the janux.cost.usd the page prints', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await post(buildApp(), '/_janux/agent', { messages: [{ role: 'user', content: 'check out' }], path: '/' });

    const chat = tracer.spans.find((span) => span.name === 'chat claude-fable-5')!;

    expect(chat.attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': 'claude-fable-5',
      'gen_ai.response.model': 'claude-fable-5-20260501',
      'gen_ai.usage.input_tokens': 1200,
      'gen_ai.usage.output_tokens': 300,
    });
    // 1200/1e6 * 3 + 300/1e6 * 15 = 0.0081, the figure printed in the trace.
    expect(chat.attributes['janux.cost.usd']).toBeCloseTo(0.0081, 6);
  });

  it('splits origin across the approval and the execution — the load-bearing detail', async () => {
    const tracer = recordingTracer();
    const server = buildApp();

    setTracer(tracer);
    const turn = await (await post(server, '/_janux/agent', { messages: [{ role: 'user', content: 'check out' }], path: '/' })).text();
    const proposal = tracer.spans.find((span) => span.name === 'janux.api')!;
    // Spans tie the story together with the bare id; approving needs the signed
    // token from the agent's reply.
    const id = proposal.attributes['janux.proposal.id'] as string;
    const [token] = turn.match(/prop_api_[0-9a-f-]{36}\.[A-Za-z0-9_-]+/)!;
    const approved = await (await post(server, '/_janux/approve', { id: token })).json();

    expect(proposal.attributes).toMatchObject({
      'janux.intent': 'api.shop.checkout',
      'janux.guard': 'confirm',
      'janux.origin': 'agent',
    });
    expect(tracer.spans.find((span) => span.name === 'janux.proposal.approve')!.attributes).toMatchObject({
      'janux.origin': 'human',
      'janux.proposal.id': id,
    });
    expect(tracer.spans.find((span) => span.name === 'janux.api.execute')!.attributes).toMatchObject({
      'janux.origin': 'agent',
      'janux.proposal.id': id,
    });
    expect(approved.result).toEqual({ ordered: 'JX-1' });
  });
});
