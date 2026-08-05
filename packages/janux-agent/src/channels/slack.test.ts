import { describe, expect, it } from 'bun:test';
import { slackChannel } from './slack';

/**
 * Slack, with no Slack SDK: a slash command is a signed form POST that wants a
 * JSON answer on the same request. Everything the adapter needs is the signing
 * secret and WebCrypto.
 */

const SECRET = '8f742231b10e8888abcd99yyyzzz85a5';

async function signed(form: Record<string, string>, options: { secret?: string; timestamp?: number } = {}) {
  const body = new URLSearchParams(form).toString();
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(options.secret ?? SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
  const signature = `v0=${[...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;

  return new Request('http://test/_janux/channels/slack', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': signature },
  });
}

const command = { text: 'how many orders are pending?', channel_id: 'C123', user_id: 'U9' };

describe('the slack channel', () => {
  const channel = slackChannel({ signingSecret: SECRET });

  it('turns a signed slash command into a turn, threaded by the Slack channel', async () => {
    const received = await channel.receive(await signed(command));

    expect(received).toEqual({ text: 'how many orders are pending?', threadId: 'slack:C123' });
  });

  it('refuses a signature made with another secret', async () => {
    const response = (await channel.receive(await signed(command, { secret: 'not-the-secret' }))) as Response;

    expect(response.status).toBe(401);
  });

  it('refuses a replayed request, however well signed', async () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 10;
    const response = (await channel.receive(await signed(command, { timestamp: old }))) as Response;

    expect(response.status).toBe(401);
  });

  it('refuses a request with no signature at all', async () => {
    const response = (await channel.receive(
      new Request('http://test/_janux/channels/slack', { method: 'POST', body: new URLSearchParams(command).toString() }),
    )) as Response;

    expect(response.status).toBe(401);
  });

  it('ignores a command with an empty text instead of asking the model about nothing', async () => {
    expect(await channel.receive(await signed({ ...command, text: '' }))).toBeUndefined();
  });

  it('answers in the channel the command came from', async () => {
    const response = await channel.send({ text: 'Four are pending.' });

    expect(await response.json()).toEqual({ response_type: 'in_channel', text: 'Four are pending.' });
  });

  /** A refusal is the bot's business, not the whole channel's. */
  it('keeps a refusal ephemeral', async () => {
    const response = await channel.send({ text: "I can't help with that.", error: 'refusal' });

    expect(await response.json()).toMatchObject({ response_type: 'ephemeral' });
  });
});
