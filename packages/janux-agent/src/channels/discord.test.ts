import { beforeAll, describe, expect, it } from 'bun:test';
import { discordChannel } from './discord';

/**
 * Discord, with no Discord SDK: an interaction is an Ed25519-signed JSON POST
 * whose reply rides the same response. The PING handshake is answered by the
 * adapter itself — Discord sends it before the endpoint is ever saved, and it
 * must not cost a model turn.
 */

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

let publicKey = '';
let sign: (body: string, timestamp: string) => Promise<string>;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;

  publicKey = hex(await crypto.subtle.exportKey('raw', pair.publicKey));
  sign = async (body, timestamp) => hex(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(timestamp + body)));
});

async function interaction(payload: unknown, options: { signature?: string } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  return new Request('http://test/_janux/channels/discord', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-signature-timestamp': timestamp,
      'x-signature-ed25519': options.signature ?? (await sign(body, timestamp)),
    },
  });
}

const ask = { type: 2, channel_id: 'C77', data: { name: 'ask', options: [{ name: 'question', value: 'how many orders are pending?' }] } };

describe('the discord channel', () => {
  it('answers the PING handshake itself, with no turn', async () => {
    const channel = discordChannel({ publicKey });
    const response = (await channel.receive(await interaction({ type: 1 }))) as Response;

    expect(await response.json()).toEqual({ type: 1 });
  });

  it('turns a signed command into a turn, threaded by the Discord channel', async () => {
    const channel = discordChannel({ publicKey });

    expect(await channel.receive(await interaction(ask))).toEqual({ text: 'how many orders are pending?', threadId: 'discord:C77' });
  });

  it('refuses a bad signature — the endpoint is public, so the key is the door', async () => {
    const channel = discordChannel({ publicKey });
    const response = (await channel.receive(await interaction(ask, { signature: 'ab'.repeat(64) }))) as Response;

    expect(response.status).toBe(401);
  });

  it('refuses a request with no signature at all', async () => {
    const channel = discordChannel({ publicKey });
    const response = (await channel.receive(
      new Request('http://test/_janux/channels/discord', { method: 'POST', body: JSON.stringify(ask) }),
    )) as Response;

    expect(response.status).toBe(401);
  });

  it('ignores an interaction that carries no question', async () => {
    const channel = discordChannel({ publicKey });

    expect(await channel.receive(await interaction({ ...ask, data: { name: 'ask', options: [] } }))).toBeUndefined();
  });

  it('replies as a channel message', async () => {
    const channel = discordChannel({ publicKey });
    const response = await channel.send({ text: 'Four are pending.' });

    expect(await response.json()).toEqual({ type: 4, data: { content: 'Four are pending.' } });
  });

  it('keeps a refusal to the person who asked', async () => {
    const channel = discordChannel({ publicKey });
    const response = await channel.send({ text: "I can't help with that.", error: 'refusal' });

    expect((await response.json()) as any).toMatchObject({ data: { flags: 64 } });
  });
});
