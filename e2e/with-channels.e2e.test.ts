import { describe, expect, it } from 'bun:test';
import { jsx } from '../packages/janux/src/index';
import { createTestApp } from '@janux/testing';
import { defineAgent } from '../packages/janux-agent/src/agent';
import { webhookChannel } from '../packages/janux-agent/src/channels/webhook';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { onCallDesk } from '../examples/with-channels/src/agent';
import { acknowledge, list_incidents, page_engineer, pagesSent } from '../examples/with-channels/src/server/oncall.api';
import { IncidentBoard } from '../examples/with-channels/src/components/IncidentBoard';
import { appRoot } from './support/app';

/**
 * examples/with-channels: the acceptance, end to end.
 *
 * The same agent config, the same server, the same scripted provider — asked
 * the same thing through the browser endpoint and through the webhook. What
 * must hold is that the guards do not move, and that the surface degrades
 * honestly rather than silently.
 */

const SECRET = 'e2e-secret';

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), { status: 200 });
}

const text = (reply: string) => anthropicReply([{ type: 'text', text: reply }]);
const toolUse = (id: string, name: string, input: unknown) => anthropicReply([{ type: 'tool_use', id, name, input }]);

/** The example's real agent and real tools, with the model scripted. */
function scriptedServer(replies: Response[]) {
  const calls: { body: any }[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });

    return replies.shift() ?? text('done');
  };
  const server = createJanuxServer({
    routes: { '/': () => jsx(IncidentBoard as any, {}) },
    apis: { oncall: { list_incidents, acknowledge, page_engineer } },
    agent: defineAgent(onCallDesk, { env: { ANTHROPIC_API_KEY: 'sk-e2e' }, fetchImpl }),
    channels: { webhook: webhookChannel({ secret: SECRET }) },
  });

  return { calls, server };
}

const askBrowser = (server: ReturnType<typeof createJanuxServer>, content: string) =>
  server.fetch(
    new Request('http://test/_janux/agent', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content }] }),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    }),
  );

const askWebhook = (server: ReturnType<typeof createJanuxServer>, content: string) =>
  server.fetch(
    new Request('http://test/_janux/channels/webhook', {
      method: 'POST',
      body: JSON.stringify({ text: content }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
    }),
  );

describe('examples/with-channels SSR', () => {
  it('serves the board and tells the reader how to reach it from outside', async () => {
    const app = await createTestApp(appRoot('examples/with-channels'));
    const home = await app.fetch('/');
    const html = await home.text();

    expect(home.status).toBe(200);
    expect(html).toContain('INC-41');
    expect(html).toContain('/_janux/channels/webhook');
  });
});

describe('examples/with-channels: the same agent on both doors', () => {
  it('answers a read the same way in the browser and over the webhook', async () => {
    const browser = scriptedServer([toolUse('t1', 'api__oncall__list_incidents', {}), text('Three incidents, INC-41 is sev 1.')]);
    const webhook = scriptedServer([toolUse('t1', 'api__oncall__list_incidents', {}), text('Three incidents, INC-41 is sev 1.')]);

    const fromBrowser: any = await (await askBrowser(browser.server, 'what is on the board?')).json();
    const fromWebhook: any = await (await askWebhook(webhook.server, 'what is on the board?')).json();

    expect(fromBrowser.text).toBe('Three incidents, INC-41 is sev 1.');
    expect(fromWebhook.text).toBe('Three incidents, INC-41 is sev 1.');
  });

  it('holds the confirm guard identically on both doors: paging a human is proposed, never sent', async () => {
    const before = pagesSent().length;
    const paging = () => [
      toolUse('t1', 'api__oncall__page_engineer', { id: 'INC-41', engineer: 'ada' }),
      text('I have asked for approval to page ada.'),
    ];
    const browser = scriptedServer(paging());
    const webhook = scriptedServer(paging());

    await askBrowser(browser.server, 'page ada for INC-41');
    await askWebhook(webhook.server, 'page ada for INC-41');

    // Both doors saw a parked proposal rather than a result, and nobody was woken up.
    const observed = (calls: { body: any }[]) => JSON.stringify(calls[1]!.body.messages);

    expect(observed(browser.calls)).toContain('proposal');
    expect(observed(webhook.calls)).toContain('proposal');
    expect(pagesSent().length).toBe(before);
  });

  it('offers the page tools in the browser and withholds them on the webhook, by name', async () => {
    const browser = scriptedServer([text('hi')]);
    const webhook = scriptedServer([text('hi')]);

    await askBrowser(browser.server, 'hello');
    await askWebhook(webhook.server, 'hello');

    const browserTools = browser.calls[0]!.body.tools.map((tool: any) => tool.name);
    const webhookTools = webhook.calls[0]!.body.tools.map((tool: any) => tool.name);

    expect(browserTools).toContain('ui_click');
    expect(browserTools).toContain('incident-board__focus');
    expect(webhookTools).not.toContain('ui_click');
    expect(webhookTools).not.toContain('incident-board__focus');
    // Both still have the server tools…
    expect(webhookTools).toContain('api__oncall__acknowledge');
    // …and the model is told what it is missing, rather than left to guess.
    expect(webhook.calls[0]!.body.system).toContain('incident-board.focus');
    expect(webhook.calls[0]!.body.system).toContain('"webhook" channel');
  });

  it('answers a browser-only call over the webhook instead of failing on it', async () => {
    const { server, calls } = scriptedServer([
      toolUse('t1', 'incident-board__focus', { id: 'INC-41' }),
      text('I cannot highlight it from here — open the board to see it.'),
    ]);

    const reply: any = await (await askWebhook(server, 'highlight INC-41 on the board')).json();

    expect(reply.text).toBe('I cannot highlight it from here — open the board to see it.');
    expect(JSON.stringify(calls[1]!.body.messages)).toContain('tool_unavailable_on_channel');
  });

  it('refuses a caller without the shared secret before any model turn', async () => {
    const { server, calls } = scriptedServer([text('never reached')]);

    const response = await server.fetch(
      new Request('http://test/_janux/channels/webhook', { method: 'POST', body: JSON.stringify({ text: 'hi' }) }),
    );

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe('examples/with-channels: the channel the example actually ships', () => {
  /**
   * Discovery, asserted by the only thing that distinguishes a mounted channel
   * from an absent one. Which refusal the webhook answers with depends on
   * whether `JANUX_WEBHOOK_SECRET` was set when the module loaded, and that is
   * the channel's business — being *there* is `src/channels/`'s.
   */
  it('is discovered from src/channels/ and mounted under its own name', async () => {
    const app = await createTestApp(appRoot('examples/with-channels'));
    const send = (name: string) => app.fetch(`/_janux/channels/${name}`, { method: 'POST', body: JSON.stringify({ text: 'hi' }) });

    expect((await send('webhook')).status).not.toBe(404);
    expect((await send('nothing-declares-this')).status).toBe(404);
  });
});
