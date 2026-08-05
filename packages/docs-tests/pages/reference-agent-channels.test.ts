import { describe, expect, it } from 'bun:test';
import { defineChannel, discordChannel, slackChannel, webhookChannel } from '@janux/agent';
import { CHANNELS_PREFIX, channelOf, createJanuxServer, handleChannel, type AgentMount } from '@janux/server';
import { unavailableOnChannel } from '../../janux-agent/src/channels/surface';

/**
 * guide/channels.md and reference/agent-channels.md. What a reader would
 * otherwise take on faith: that the two-method shape really does cover three
 * transports, that a handshake and an ignored event cost no model turn, and
 * that the error the pages print is the error the loop produces.
 */

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://test${path}`, { method: 'POST', body: JSON.stringify(body), headers });

/** A mount that records the turns it was asked for, standing in for the loop. */
function recordingAgent(turns: any[]): AgentMount {
  return {
    handle: async (req) => {
      turns.push(await req.json());

      return Response.json({ type: 'text', text: 'four are pending', threadId: 'ops-1' });
    },
  };
}

describe('guide/channels.md', () => {
  it('the two-method channel in the page is the whole contract', async () => {
    const turns: any[] = [];
    const channel = defineChannel({
      receive: async (req) => ({ text: ((await req.json()) as { text: string }).text }),
      send: (reply) => Response.json(reply),
    });

    const response = await handleChannel(post('/x', { text: 'how many orders are pending?' }), 'webhook', channel, recordingAgent(turns), {} as any);

    expect(await response.json()).toMatchObject({ text: 'four are pending' });
    // The turn is an ordinary user message, labelled with its channel.
    expect(turns).toEqual([{ channel: 'webhook', messages: [{ role: 'user', content: 'how many orders are pending?' }] }]);
  });

  it("receive's two non-turn answers cost no model call: a handshake, and an event with nothing in it", async () => {
    const turns: any[] = [];
    const handshake = defineChannel({ receive: () => new Response('challenge'), send: (reply) => Response.json(reply) });
    const ignores = defineChannel({ receive: () => undefined, send: (reply) => Response.json(reply) });

    expect(await (await handleChannel(post('/x', {}), 'c', handshake, recordingAgent(turns), {} as any)).text()).toBe('challenge');
    expect((await handleChannel(post('/x', {}), 'c', ignores, recordingAgent(turns), {} as any)).status).toBe(204);
    expect(turns).toEqual([]);
  });

  it('a channel is discovered by name under the documented prefix', () => {
    expect(CHANNELS_PREFIX).toBe('/_janux/channels/');
    expect(channelOf('/_janux/channels/ops/inbox')).toBe('ops/inbox');
    expect(channelOf('/_janux/agent')).toBeUndefined();
  });

  /** The guide's central claim: a channel is not a laxer door. */
  it('the same guards decide, because it is the same pipeline', async () => {
    const server = createJanuxServer({
      agent: { handle: async (_req, deps) => Response.json({ type: 'text', text: JSON.stringify(await deps.invoke('api.ops.page', { id: 'INC-41' })) }) },
      apis: { ops: { page: (await import('@janux/server')).api({ description: 'Wake someone up.', guard: 'confirm', run: () => ({ paged: true }) }) } },
      channels: { webhook: defineChannel({ receive: async (req) => ({ text: ((await req.json()) as any).text }), send: (reply) => Response.json(reply) }) },
    });

    const reply: any = await (await server.fetch(post('/_janux/channels/webhook', { text: 'page someone' }))).json();

    expect(JSON.parse(reply.text).status).toBe('proposal');
  });
});

describe('reference/agent-channels.md', () => {
  it('webhookChannel: bearer in, JSON out — and closed when its key is unset', async () => {
    const channel = webhookChannel({ secret: 'sh' });
    const ok = await channel.receive(post('/x', { text: 'how many orders are pending?', threadId: 'ops-1' }, { authorization: 'Bearer sh' }));

    expect(ok).toEqual({ text: 'how many orders are pending?', threadId: 'ops-1' });
    expect(((await channel.receive(post('/x', { text: 'hi' }))) as Response).status).toBe(401);
    expect(((await channel.receive(new Request('http://test/x', { headers: { authorization: 'Bearer sh' } }))) as Response).status).toBe(405);
    const unconfigured = webhookChannel({ secret: '' });

    expect(((await unconfigured.receive(post('/x', { text: 'hi' }))) as Response).status).toBe(503);
  });

  it('slackChannel: a signed slash command, threaded by Slack channel, ephemeral when refused', async () => {
    const signingSecret = 'shh';
    const channel = slackChannel({ signingSecret });
    const body = new URLSearchParams({ text: 'what is on the board?', channel_id: 'C123' }).toString();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
    const headers = { 'x-slack-request-timestamp': timestamp, 'x-slack-signature': `v0=${hex(mac)}` };

    expect(await channel.receive(new Request('http://test/x', { method: 'POST', body, headers }))).toEqual({
      text: 'what is on the board?',
      threadId: 'slack:C123',
    });
    expect(await (await channel.send({ text: 'ok' })).json()).toMatchObject({ response_type: 'in_channel' });
    expect(await (await channel.send({ text: 'no', error: 'refusal' })).json()).toMatchObject({ response_type: 'ephemeral' });
  });

  it('discordChannel: the PING handshake is answered without a turn', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const channel = discordChannel({ publicKey: hex(await crypto.subtle.exportKey('raw', pair.publicKey)) });
    const body = JSON.stringify({ type: 1 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = hex(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(timestamp + body)));
    const req = new Request('http://test/x', { method: 'POST', body, headers: { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': signature } });

    expect(await ((await channel.receive(req)) as Response).json()).toEqual({ type: 1 });
  });

  it('prints the unavailable-tool result the page shows', () => {
    expect(unavailableOnChannel('ui_navigate', 'webhook')).toMatchObject({
      error: 'tool_unavailable_on_channel',
      tool: 'ui_navigate',
      channel: 'webhook',
    });
  });
});
