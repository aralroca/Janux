import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { defineAgent } from '../agent';

/**
 * The same loop, on a surface with no browser.
 *
 * The acceptance these cases encode: a channel turn runs the ordinary agent —
 * same mount, same guards — but the tools that need a live DOM are not offered,
 * the model is *told* which ones they are, and a call that reaches for one
 * anyway comes back as a result it can recover from rather than an envelope no
 * webhook can execute.
 */

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), { status: 200 });
}

function scriptedFetch(replies: Response[]) {
  const calls: { body: any }[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });

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

const env = { ANTHROPIC_API_KEY: 'sk-test' };

function buildServer(agent: ReturnType<typeof defineAgent>) {
  return createJanuxServer({
    routes: { '/': () => jsx(counter as any, {}) },
    apis: { shop: { search: api({ input: schema({ q: str() }), run: ({ input }) => [`found:${input.q}`] }) } },
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

const toolNames = (call: { body: any }): string[] => call.body.tools.map((tool: any) => tool.name);

describe('the agent turn on a channel', () => {
  it('offers the browser surface without a channel, and withholds it with one', async () => {
    const browser = scriptedFetch([anthropicReply([{ type: 'text', text: 'hi' }])]);
    const webhook = scriptedFetch([anthropicReply([{ type: 'text', text: 'hi' }])]);

    await ask(buildServer(defineAgent({}, { env, fetchImpl: browser.fetchImpl })), { messages: [{ role: 'user', content: 'hi' }] });
    await ask(buildServer(defineAgent({}, { env, fetchImpl: webhook.fetchImpl })), {
      channel: 'webhook',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(toolNames(browser.calls[0]!)).toContain('ui_navigate');
    expect(toolNames(browser.calls[0]!)).toContain('counter__rename');
    // Nothing that needs a DOM survives the crossing…
    expect(toolNames(webhook.calls[0]!)).not.toContain('ui_navigate');
    expect(toolNames(webhook.calls[0]!)).not.toContain('counter__rename');
    // …and everything the server answers itself does.
    expect(toolNames(webhook.calls[0]!)).toContain('api__shop__search');
  });

  it('tells the model what it does not have here, by name', async () => {
    const { fetchImpl, calls } = scriptedFetch([anthropicReply([{ type: 'text', text: 'hi' }])]);

    await ask(buildServer(defineAgent({}, { env, fetchImpl })), { channel: 'slack', messages: [{ role: 'user', content: 'hi' }] });

    const system: string = calls[0]!.body.system;

    expect(system).toContain('"slack"');
    expect(system).toContain('ui_navigate');
    expect(system).toContain('counter.rename');
  });

  it('answers a call for a browser tool with a result it can recover from, not a dead envelope', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'ui_navigate', input: { path: '/cart' } }]),
      anthropicReply([{ type: 'text', text: 'I cannot open the page from here.' }]),
    ]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));

    const body: any = await (await ask(server, { channel: 'webhook', messages: [{ role: 'user', content: 'open the cart' }] })).json();

    // The turn finished with an answer; it never handed a webhook ui_calls.
    expect(body.type).toBe('text');
    expect(body.text).toBe('I cannot open the page from here.');
    const observed = JSON.stringify(calls[1]!.body.messages);

    expect(observed).toContain('tool_unavailable_on_channel');
    expect(observed).toContain('ui_navigate');
  });

  it('still runs the server tools it does have, through the same pipeline', async () => {
    const { fetchImpl } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'api__shop__search', input: { q: 'shoes' } }]),
      anthropicReply([{ type: 'text', text: 'Found 1 result' }]),
    ]);
    const server = buildServer(defineAgent({}, { env, fetchImpl }));

    const body: any = await (await ask(server, { channel: 'webhook', messages: [{ role: 'user', content: 'search shoes' }] })).json();

    expect(body).toMatchObject({ type: 'text', text: 'Found 1 result' });
  });

  it('stops advertising the route map, which only exists to be walked with ui_navigate', async () => {
    const browser = scriptedFetch([anthropicReply([{ type: 'text', text: 'hi' }])]);
    const webhook = scriptedFetch([anthropicReply([{ type: 'text', text: 'hi' }])]);

    await ask(buildServer(defineAgent({}, { env, fetchImpl: browser.fetchImpl })), { messages: [{ role: 'user', content: 'hi' }] });
    await ask(buildServer(defineAgent({}, { env, fetchImpl: webhook.fetchImpl })), {
      channel: 'webhook',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(browser.calls[0]!.body.system).toContain('App routes');
    expect(webhook.calls[0]!.body.system).not.toContain('App routes');
  });
});
