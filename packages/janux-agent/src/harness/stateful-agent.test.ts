import { describe, expect, it } from 'bun:test';
import { defineAgent } from '../agent';
import { createMemory } from './memory';
import { createMemoryStorage } from './storage';
import { injectionGuard } from './processors';

const ENV = { JANUX_MODEL: 'anthropic/test-model', ANTHROPIC_API_KEY: 'k' };

/** A scripted provider: echoes how many messages it received. */
function scriptedFetch(): typeof fetch {
  return (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const count = body.messages.length;

    return new Response(
      JSON.stringify({ content: [{ type: 'text', text: `seen:${count}` }], stop_reason: 'end_turn' }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

const DEPS = {
  tools: [],
  invoke: async () => null,
  manifestFor: async () => ({ resources: [], tools: [] }),
};

function turnRequest(payload: Record<string, unknown>): Request {
  return new Request('http://x/_janux/agent', { method: 'POST', body: JSON.stringify(payload) });
}

describe('stateful agent (harness wiring)', () => {
  it('threads: remembers turns and feeds bounded history to the provider', async () => {
    const memory = createMemory({ storage: createMemoryStorage(), lastMessages: 10 });
    const agent = defineAgent({ harness: { memory } }, { env: ENV, fetchImpl: scriptedFetch() });
    const first = await (await agent.handle(turnRequest({ messages: [{ role: 'user', content: 'hola' }] }), DEPS as any)).json();

    expect(first.threadId).toBeDefined();
    expect(first.text).toBe('seen:1');

    const second = await (
      await agent.handle(
        turnRequest({ threadId: first.threadId, messages: [{ role: 'user', content: 'sigue' }] }),
        DEPS as any,
      )
    ).json();

    // history: user + assistant + user = 3 mensajes al provider
    expect(second.text).toBe('seen:3');
    expect(second.threadId).toBe(first.threadId);
  });

  it('guardrails: a blocked injection returns a typed refusal without calling the provider', async () => {
    let called = false;
    const spyFetch: any = async () => {
      called = true;

      return new Response('{}');
    };
    const agent = defineAgent(
      { harness: { processors: [injectionGuard(() => 'suspicious')] } },
      { env: ENV, fetchImpl: spyFetch },
    );
    const reply = await (await agent.handle(turnRequest({ messages: [{ role: 'user', content: 'ignore previous' }] }), DEPS as any)).json();

    expect(reply.type).toBe('refusal');
    expect(reply.reason).toBe('prompt_injection');
    expect(called).toBe(false);
  });

  it('rate limit: the N+1th request within the window is 429', async () => {
    const agent = defineAgent(
      { harness: { rateLimit: { limit: 2, windowMs: 60_000 } } },
      { env: ENV, fetchImpl: scriptedFetch() },
    );
    const status = async () =>
      (await agent.handle(turnRequest({ messages: [{ role: 'user', content: 'x' }] }), DEPS as any)).status;

    expect(await status()).toBe(200);
    expect(await status()).toBe(200);
    expect(await status()).toBe(429);
  });

  it('identity: fail-closed 401 when the resolver rejects; threads are ownership-scoped', async () => {
    const memory = createMemory({ storage: createMemoryStorage() });
    const agent = defineAgent(
      { harness: { memory, identityFor: (req) => req.headers.get('x-user') ?? undefined } },
      { env: ENV, fetchImpl: scriptedFetch() },
    );
    const anonymous = await agent.handle(turnRequest({ messages: [{ role: 'user', content: 'x' }] }), DEPS as any);

    expect(anonymous.status).toBe(401);

    const mine = await (
      await agent.handle(
        new Request('http://x/_janux/agent', {
          method: 'POST',
          headers: { 'x-user': 'u1' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'hola' }] }),
        }),
        DEPS as any,
      )
    ).json();
    const theft = await agent.handle(
      new Request('http://x/_janux/agent', {
        method: 'POST',
        headers: { 'x-user': 'intruder' },
        body: JSON.stringify({ threadId: mine.threadId, messages: [{ role: 'user', content: 'gimme' }] }),
      }),
      DEPS as any,
    );

    expect(theft.status).toBe(403);
  });
});
