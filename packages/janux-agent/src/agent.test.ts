import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { resolveModel } from './model';
import { defineAgent } from './agent';

describe('model resolution (RFC §8.1)', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-a', OPENAI_API_KEY: 'sk-o' };

  it('explicit model wins', () => {
    const model = resolveModel('openai/gpt-5.2', env)!;

    expect(model).toMatchObject({ provider: 'openai', model: 'gpt-5.2', source: 'defineAgent({ model })' });
  });

  it('JANUX_MODEL env comes second', () => {
    const model = resolveModel(undefined, { ...env, JANUX_MODEL: 'anthropic/claude-fable-5' })!;

    expect(model).toMatchObject({ provider: 'anthropic', model: 'claude-fable-5', source: 'JANUX_MODEL' });
  });

  it('sniffs the provider from the first available API key', () => {
    const model = resolveModel(undefined, { OPENAI_API_KEY: 'sk-o' })!;

    expect(model.provider).toBe('openai');
    expect(model.source).toContain('OPENAI_API_KEY');
  });

  it('returns undefined with no keys (setup card path)', () => {
    expect(resolveModel(undefined, {})).toBeUndefined();
  });
});

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), { status: 200 });
}

function scriptedFetch(replies: Response[]) {
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });

    return replies.shift() ?? anthropicReply([{ type: 'text', text: 'done' }]);
  };

  return { fetchImpl, calls };
}

const counter = component({
  name: 'counter',
  state: schema({ label: str() }),
  intents: { rename: intent({ input: schema({ label: str() }), run: () => {} }) },
  view: () => jsx('p', { children: 'hi' }),
});

function buildServer(agent: ReturnType<typeof defineAgent>) {
  return createJanuxServer({
    routes: { '/': () => jsx(counter as any, {}) },
    apis: {
      shop: {
        search: api({ input: schema({ q: str() }), run: ({ input }) => [`found:${input.q}`] }),
      },
    },
    agent,
  });
}

const ask = (server: ReturnType<typeof buildServer>, body: unknown) =>
  server.fetch(
    new Request('http://test/_janux/agent', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('agent loop', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-test' };

  it('returns a setup card when no model is configured', async () => {
    const server = buildServer(defineAgent({}, { env: {} }));
    const body: any = await (await ask(server, { messages: [] })).json();

    expect(body.type).toBe('setup');
    expect(body.message).toContain('JANUX_MODEL');
  });

  it('answers plain text and reports the resolved model', async () => {
    const { fetchImpl } = scriptedFetch([anthropicReply([{ type: 'text', text: 'Hello!' }])]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'hi' }] })).json();

    expect(body).toMatchObject({ type: 'text', text: 'Hello!', model: 'anthropic/claude-sonnet-5' });
  });

  it('executes api.* tools server-side and continues the loop', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'api__shop__search', input: { q: 'shoes' } }]),
      anthropicReply([{ type: 'text', text: 'Found 1 result' }]),
    ]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'search shoes' }] })).json();

    expect(body.type).toBe('text');
    expect(body.text).toBe('Found 1 result');
    const toolResult = calls[1]!.body.messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(toolResult.content[0].content).toBe('["found:shoes"]');
  });

  it('returns ui_calls for UI tools so the client bridge executes them', async () => {
    const { fetchImpl } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't2', name: 'counter__rename', input: { label: 'x' } }]),
    ]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'rename' }] })).json();

    expect(body.type).toBe('ui_calls');
    expect(body.calls).toEqual([{ id: 't2', name: 'counter.rename', input: { label: 'x' } }]);
    expect(body.messages.at(-1).toolCalls).toHaveLength(1);
  });

  it('coalesces parallel tool results into one user message (Anthropic alternation)', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      anthropicReply([
        { type: 'tool_use', id: 'a1', name: 'api__shop__search', input: { q: 'x' } },
        { type: 'tool_use', id: 'a2', name: 'api__shop__search', input: { q: 'y' } },
      ]),
      anthropicReply([{ type: 'text', text: 'both done' }]),
    ]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'go' }] })).json();

    expect(body.text).toBe('both done');
    const secondRequest = calls[1]!.body.messages;
    const userMessages = secondRequest.filter((m: any) => m.role === 'user');

    expect(userMessages).toHaveLength(2);
    expect(userMessages[1].content).toHaveLength(2);
    expect(userMessages[1].content.map((b: any) => b.tool_use_id)).toEqual(['a1', 'a2']);
    secondRequest.forEach((message: any, index: number) => {
      if (index === 0) return;
      expect(message.role).not.toBe(secondRequest[index - 1].role);
    });
  });

  it('exposes manifest tools with guard annotations to the model', async () => {
    const { fetchImpl, calls } = scriptedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));

    await ask(server, { messages: [{ role: 'user', content: 'hi' }], path: '/' });
    const toolNames = calls[0]!.body.tools.map((tool: any) => tool.name);

    expect(toolNames).toContain('counter__rename');
    expect(toolNames).toContain('api__shop__search');
  });
});

describe('client tools + continuation (agentic parity)', () => {
  const env = { ANTHROPIC_API_KEY: 'k' };

  it('always advertises the built-in client tools next to the page tools', async () => {
    const { fetchImpl, calls } = scriptedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));

    await ask(server, { path: '/', messages: [{ role: 'user', content: 'hi' }] });
    const names = calls[0]!.body.tools.map((tool: any) => tool.name);

    expect(names).toContain('ui_navigate');
    expect(names).toContain('ui_read_page');
    expect(names).toContain('counter__rename');
  });

  it('injects the app-wide route map into the system prompt', async () => {
    const { fetchImpl, calls } = scriptedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));

    await ask(server, { path: '/', messages: [{ role: 'user', content: 'hi' }] });

    expect(String(calls[0]!.body.system)).toContain('App routes');
    expect(String(calls[0]!.body.system)).toContain('ui_navigate');
  });

  it('continues the SAME turn from re-POSTed toolResults', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'ui_navigate', input: { path: '/shop' } }]),
      anthropicReply([{ type: 'text', text: 'you are there' }]),
    ]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));
    const first = await (await ask(server, { path: '/', messages: [{ role: 'user', content: 'go to shop' }] })).json();

    expect(first.type).toBe('ui_calls');
    expect(first.calls[0].name).toBe('ui_navigate');
    const second = await (
      await ask(server, {
        path: '/shop',
        threadId: first.threadId,
        continuation: true,
        toolResults: [{ name: 'ui_navigate', output: { navigated: '/shop' } }],
        messages: [],
      })
    ).json();

    expect(second.type).toBe('text');
    expect(second.text).toBe('you are there');
    // The continuation carried the tool outputs to the provider.
    expect(JSON.stringify(calls[1]!.body.messages)).toContain('navigated');
  });
});
