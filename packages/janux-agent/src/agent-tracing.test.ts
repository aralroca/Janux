import { afterEach, describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { recordingTracer } from '../../janux/src/observability/__fixtures__/recording-tracer';
import { setTracer } from 'janux/observability';
import { defineAgent } from './agent';

afterEach(() => setTracer(undefined));

const counter = component({
  name: 'counter',
  state: schema({ label: str() }),
  intents: { rename: intent({ description: 'Rename', input: schema({ label: str() }), run: () => {} }) },
  view: () => jsx('p', { children: 'hi' }),
});

function anthropicReply(blocks: unknown[], usage = { input_tokens: 1200, output_tokens: 300 }): Response {
  return new Response(JSON.stringify({ content: blocks, model: 'claude-fable-5-20260501', usage }), { status: 200 });
}

function scriptedFetch(replies: Response[]) {
  return async () => replies.shift() ?? anthropicReply([{ type: 'text', text: 'done' }]);
}

function buildServer(agent: ReturnType<typeof defineAgent>) {
  return createJanuxServer({
    routes: { '/': () => jsx(counter as any, {}) },
    apis: { shop: { search: api({ description: 'Search', input: schema({ q: str() }), run: () => ['found'] }) } },
    agent,
  });
}

const ask = (server: ReturnType<typeof buildServer>, body: unknown) =>
  server.fetch(
    new Request('http://test/_janux/agent', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    }),
  );

const env = { ANTHROPIC_API_KEY: 'sk-a' };
const turn = { messages: [{ role: 'user', content: 'rename it' }], path: '/' };

describe('the agent loop emits gen_ai spans', () => {
  it('follows the semantic conventions: span name, operation, provider and models', async () => {
    const tracer = recordingTracer();
    const agent = defineAgent({ model: 'anthropic/claude-fable-5' }, { env, fetchImpl: scriptedFetch([]) });

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    const chat = tracer.spans.find((span) => span.name.startsWith('chat '))!;

    expect(chat.name).toBe('chat claude-fable-5');
    expect(chat.attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': 'claude-fable-5',
      'gen_ai.response.model': 'claude-fable-5-20260501',
    });
  });

  it('reports the tokens the turn actually cost', async () => {
    const tracer = recordingTracer();
    const agent = defineAgent({ model: 'anthropic/claude-fable-5' }, { env, fetchImpl: scriptedFetch([]) });

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    expect(tracer.spans.find((span) => span.name.startsWith('chat '))!.attributes).toMatchObject({
      'gen_ai.usage.input_tokens': 1200,
      'gen_ai.usage.output_tokens': 300,
    });
  });

  it('prices the turn when the app declared what its model costs', async () => {
    const tracer = recordingTracer();
    const agent = defineAgent(
      // USD per million tokens, the unit every provider publishes.
      { model: 'anthropic/claude-fable-5', cost: { input: 3, output: 15 } },
      { env, fetchImpl: scriptedFetch([]) },
    );

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    // 1200/1e6 * 3 + 300/1e6 * 15 = 0.0036 + 0.0045
    expect(tracer.spans.find((span) => span.name.startsWith('chat '))!.attributes['janux.cost.usd']).toBeCloseTo(0.0081, 6);
  });

  it('leaves the cost off when the app never said what a token costs', async () => {
    const tracer = recordingTracer();
    const agent = defineAgent({ model: 'anthropic/claude-fable-5' }, { env, fetchImpl: scriptedFetch([]) });

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    expect(tracer.spans.find((span) => span.name.startsWith('chat '))!.attributes['janux.cost.usd']).toBeUndefined();
  });

  it('opens one span per round of the loop, so a tool-calling turn is legible', async () => {
    const tracer = recordingTracer();
    const toolCall = [{ type: 'tool_use', id: 'call_1', name: 'api__shop__search', input: { q: 'shoes' } }];
    const agent = defineAgent(
      { model: 'anthropic/claude-fable-5' },
      { env, fetchImpl: scriptedFetch([anthropicReply(toolCall), anthropicReply([{ type: 'text', text: 'found it' }])]) },
    );

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    const chats = tracer.spans.filter((span) => span.name.startsWith('chat '));

    expect(chats).toHaveLength(2);
    // The server tool the model called is traced by the invocation pipeline,
    // inside the round that asked for it: one trace, both halves.
    const call = tracer.spans.find((span) => span.name === 'janux.api')!;

    expect(call.attributes).toMatchObject({ 'janux.intent': 'api.shop.search', 'janux.origin': 'agent' });
    expect(tracer.spans[call.parent]!.name).toBe('invoke_agent janux');
  });

  it('totals the whole turn on the invoke_agent span: tokens and price across every round', async () => {
    const tracer = recordingTracer();
    const toolCall = [{ type: 'tool_use', id: 'call_1', name: 'api__shop__search', input: { q: 'shoes' } }];
    const agent = defineAgent(
      { model: 'anthropic/claude-fable-5', cost: { input: 3, output: 15 } },
      { env, fetchImpl: scriptedFetch([anthropicReply(toolCall), anthropicReply([{ type: 'text', text: 'found' }])]) },
    );

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    const turnSpan = tracer.spans.find((span) => span.name === 'invoke_agent janux')!;

    // Two rounds of 1200 in / 300 out each: the turn is the sum, per punto-18 traces.
    expect(turnSpan.attributes).toMatchObject({
      'janux.turn.input_tokens': 2400,
      'janux.turn.output_tokens': 600,
    });
    expect(turnSpan.attributes['janux.turn.cost.usd']).toBeCloseTo(0.0162, 6);
  });

  /**
   * The turn totals are the sum of its rounds, so they must NOT reuse the keys
   * the rounds already carry: `sum(gen_ai.usage.input_tokens)` over a trace is
   * the standard GenAI dashboard query, and a parent repeating its children's
   * keys doubles every token and every dollar in it.
   */
  it('keeps turn totals off the per-round semconv keys, so summing a trace cannot double-count', async () => {
    const tracer = recordingTracer();
    const agent = defineAgent(
      { model: 'anthropic/claude-fable-5', cost: { input: 3, output: 15 } },
      { env, fetchImpl: scriptedFetch([]) },
    );

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    const turnSpan = tracer.spans.find((span) => span.name === 'invoke_agent janux')!;

    expect(turnSpan.attributes['gen_ai.usage.input_tokens']).toBeUndefined();
    expect(turnSpan.attributes['gen_ai.usage.output_tokens']).toBeUndefined();
    expect(turnSpan.attributes['janux.cost.usd']).toBeUndefined();
  });

  it('records a provider failure on the span with the semconv error type', async () => {
    const tracer = recordingTracer();
    const failing = async () => new Response('nope', { status: 500 });
    const agent = defineAgent({ model: 'anthropic/claude-fable-5' }, { env, fetchImpl: failing });

    setTracer(tracer);
    await ask(buildServer(agent), turn);

    const chat = tracer.spans.find((span) => span.name.startsWith('chat '))!;

    expect(chat.errors).toHaveLength(1);
    expect(chat.attributes['error.type']).toBe('provider_error');
  });

  it('emits nothing when the app is not instrumented', async () => {
    const tracer = recordingTracer();
    const agent = defineAgent({ model: 'anthropic/claude-fable-5' }, { env, fetchImpl: scriptedFetch([]) });

    await ask(buildServer(agent), turn);

    expect(tracer.spans).toEqual([]);
  });
});
