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

  /**
   * OpenRouter is the aggregator people reach for to spend less, so the model
   * it lands on when they name none should not be the most expensive one on
   * the menu. Naming a model explicitly still wins over this.
   */
  it('defaults an OpenRouter key to a cheap, fast model', () => {
    const model = resolveModel(undefined, { OPENROUTER_API_KEY: 'sk-or-x' })!;

    expect(model).toMatchObject({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });
    expect(resolveModel('openrouter/anthropic/claude-sonnet-5', { OPENROUTER_API_KEY: 'sk-or-x' })!.model).toBe(
      'anthropic/claude-sonnet-5',
    );
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
      // What the app's own page sends, and what the CSRF guard requires of it.
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
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

  /**
   * The gate is the door, not a step inside the room: an unconfigured model
   * must not turn `/_janux/agent` into an open, unmetered endpoint that also
   * skips the fail-closed identity check.
   */
  it('gates before resolving the model: no key still means auth and rate limits', async () => {
    const denied = defineAgent(
      { harness: { identityFor: () => undefined } },
      { env: {} },
    );

    expect((await ask(buildServer(denied), { messages: [] })).status).toBe(401);

    const limited = defineAgent(
      { harness: { identityFor: () => 'caller', rateLimit: { limit: 1, windowMs: 60_000 } } },
      { env: {} },
    );
    const server = buildServer(limited);

    expect((await ask(server, { messages: [] })).status).toBe(200);
    const rejected = await ask(server, { messages: [] });

    expect(rejected.status).toBe(429);
    expect(((await rejected.json()) as any).error).toBe('rate_limited');
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

  it('accounts the turn bill in the envelope: tokens summed across rounds, priced when cost is declared', async () => {
    const priced = (blocks: unknown[], usage: unknown) =>
      new Response(JSON.stringify({ content: blocks, usage }), { status: 200 });
    const { fetchImpl } = scriptedFetch([
      priced([{ type: 'tool_use', id: 't1', name: 'api__shop__search', input: { q: 'shoes' } }], { input_tokens: 1000, output_tokens: 100 }),
      priced([{ type: 'text', text: 'Found' }], { input_tokens: 1400, output_tokens: 60 }),
    ]);
    const server = buildServer(defineAgent({ cost: { input: 3, output: 15 } }, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'search' }] })).json();

    expect(body.usage).toMatchObject({ inputTokens: 2400, outputTokens: 160 });
    // 2400/1e6 * $3 + 160/1e6 * $15, in USD per million tokens.
    expect(body.usage.costUsd).toBeCloseTo(0.0096, 6);
  });

  /**
   * "Ran out of rounds" wears the same `type: 'text'` as a real answer, so
   * without a marker an eval step reads a give-up as a pass.
   */
  it('marks the turn-limit give-up with a stopReason, so it cannot pass for an answer', async () => {
    const looping = () => anthropicReply([{ type: 'tool_use', id: 't1', name: 'api__shop__search', input: { q: 'x' } }]);
    const { fetchImpl } = scriptedFetch(Array.from({ length: 8 }, looping));
    const server = buildServer(defineAgent({ maxTurns: 2 }, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'search' }] })).json();

    expect(body.type).toBe('text');
    expect(body.stopReason).toBe('max_turns');
  });

  it('leaves usage off the envelope when the provider never reported any', async () => {
    const { fetchImpl } = scriptedFetch([anthropicReply([{ type: 'text', text: 'Hello!' }])]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'hi' }] })).json();

    expect(body.usage).toBeUndefined();
  });

  it('a ui_calls envelope carries the bill so far, unpriced without a declared cost', async () => {
    const withUsage = new Response(
      JSON.stringify({
        content: [{ type: 'tool_use', id: 't2', name: 'counter__rename', input: { label: 'x' } }],
        usage: { input_tokens: 500, output_tokens: 50 },
      }),
      { status: 200 },
    );
    const server = buildServer(defineAgent({}, { env, fetchImpl: scriptedFetch([withUsage]).fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'rename' }] })).json();

    expect(body.type).toBe('ui_calls');
    expect(body.usage).toEqual({ inputTokens: 500, outputTokens: 50 });
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

/** A second Janux app playing the remote MCP server the agent connects to. */
const remoteMcpApp = createJanuxServer({
  title: 'remote-mcp',
  apis: {
    docs: {
      search: api({ description: 'Search remote docs', input: schema({ q: str() }), run: ({ input }) => [`doc:${input.q}`] }),
      secret: api({ description: 'Should stay hidden', run: () => 'nope' }),
    },
  },
});

/** Routes MCP traffic to the in-process remote app, everything else to the scripted provider. */
function mcpRoutedFetch(replies: Response[]) {
  const providerCalls: { url: string; body: any }[] = [];
  const mcpBodies: any[] = [];
  const mcpHeaders: Record<string, string>[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    if (!url.includes('/_janux/mcp')) {
      providerCalls.push({ url, body: JSON.parse(String(init.body)) });

      return replies.shift() ?? anthropicReply([{ type: 'text', text: 'done' }]);
    }
    mcpBodies.push(JSON.parse(String(init.body)));
    mcpHeaders.push((init.headers ?? {}) as Record<string, string>);

    return remoteMcpApp.fetch(new Request(url, init));
  };

  return { fetchImpl, providerCalls, mcpBodies, mcpHeaders };
}

const MCP = {
  url: 'http://remote/_janux/mcp',
  prefix: 'remote',
  tools: { exclude: ['remote.docs.secret'] },
  headers: { authorization: 'Bearer remote-token' },
};

describe('remote MCP tools (defineAgent({ mcp }))', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-test' };

  it('advertises the filtered, prefixed remote tools next to the local ones', async () => {
    const { fetchImpl, providerCalls, mcpHeaders } = mcpRoutedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);
    const server = buildServer(defineAgent({ mcp: MCP }, { env, fetchImpl }));

    await ask(server, { messages: [{ role: 'user', content: 'hi' }] });
    const names = providerCalls[0]!.body.tools.map((tool: any) => tool.name);

    expect(names).toContain('remote__docs__search');
    expect(names).not.toContain('remote__docs__secret');
    expect(names).toContain('api__shop__search');
    // The configured headers ride on every MCP request (auth beyond bearer tokens).
    expect(mcpHeaders[0]!.authorization).toBe('Bearer remote-token');
  });

  it('dispatches a remote tool call through the MCP connection and continues the loop', async () => {
    const { fetchImpl, providerCalls } = mcpRoutedFetch([
      anthropicReply([{ type: 'tool_use', id: 'r1', name: 'remote__docs__search', input: { q: 'janux' } }]),
      anthropicReply([{ type: 'text', text: 'found it' }]),
    ]);
    const server = buildServer(defineAgent({ mcp: MCP }, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'search' }] })).json();

    expect(body.type).toBe('text');
    expect(body.text).toBe('found it');
    const toolResult = providerCalls[1]!.body.messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(toolResult.content[0].content).toContain('doc:janux');
  });

  it('discovers lazily and caches: one tools/list across turns', async () => {
    const { fetchImpl, mcpBodies } = mcpRoutedFetch([
      anthropicReply([{ type: 'text', text: 'one' }]),
      anthropicReply([{ type: 'text', text: 'two' }]),
    ]);
    const server = buildServer(defineAgent({ mcp: MCP }, { env, fetchImpl }));

    await ask(server, { messages: [{ role: 'user', content: 'a' }] });
    await ask(server, { messages: [{ role: 'user', content: 'b' }] });

    expect(mcpBodies.filter((body) => body.method === 'tools/list')).toHaveLength(1);
  });

  it('a dead remote degrades to a turn without remote tools instead of crashing', async () => {
    const providerCalls: { body: any }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      if (url.includes('/_janux/mcp')) return new Response(null, { status: 502 });
      providerCalls.push({ body: JSON.parse(String(init.body)) });

      return anthropicReply([{ type: 'text', text: 'still here' }]);
    };
    const server = buildServer(defineAgent({ mcp: { url: 'http://dead/_janux/mcp' } }, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: [{ role: 'user', content: 'hi' }] })).json();

    expect(body).toMatchObject({ type: 'text', text: 'still here' });
    const names = providerCalls[0]!.body.tools.map((tool: any) => tool.name);

    expect(names.some((name: string) => name.startsWith('mcp__'))).toBe(false);
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
