import { describe, expect, it } from 'bun:test';
import { webhookChannel } from './webhook';

/**
 * The transport with no third party in it: the one anybody can run against a
 * local `janux dev` with `curl`, and the one the other adapters are measured
 * against — if a shape does not fit here, it is the shape that is wrong.
 */

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://test/_janux/channels/webhook', { method: 'POST', body: JSON.stringify(body), headers });

const authorized = (body: unknown) => post(body, { authorization: 'Bearer s3cret' });

describe('the webhook channel', () => {
  const channel = webhookChannel({ secret: 's3cret' });

  it('turns a signed body into a turn', async () => {
    const received = await channel.receive(authorized({ text: 'how many orders are pending?', threadId: 'ops-1' }));

    expect(received).toEqual({ text: 'how many orders are pending?', threadId: 'ops-1' });
  });

  it('carries the path, so a turn can be framed by a page other than /', async () => {
    const received = await channel.receive(authorized({ text: 'what is here?', path: '/orders' }));

    expect(received).toMatchObject({ path: '/orders' });
  });

  it('refuses an unsigned or wrongly signed caller before any model is spent', async () => {
    const anonymous = (await channel.receive(post({ text: 'hi' }))) as Response;
    const wrong = (await channel.receive(post({ text: 'hi' }, { authorization: 'Bearer nope' }))) as Response;

    expect(anonymous.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  /** Same stance as the schedules tick: declaring the door is promising to hold its key. */
  it('fails closed when the secret is unset, instead of opening to everyone', async () => {
    const unconfigured = webhookChannel({ secret: undefined as unknown as string });
    const response = (await unconfigured.receive(authorized({ text: 'hi' }))) as Response;

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'channel_unconfigured' });
  });

  it('answers a non-POST with 405 rather than a turn', async () => {
    const response = (await channel.receive(
      new Request('http://test/_janux/channels/webhook', { headers: { authorization: 'Bearer s3cret' } }),
    )) as Response;

    expect(response.status).toBe(405);
  });

  it('ignores a body with nothing to answer', async () => {
    expect(await channel.receive(authorized({}))).toBeUndefined();
    expect(await channel.receive(authorized({ text: '   ' }))).toBeUndefined();
  });

  it('renders the reply as the JSON a caller can read, thread included', async () => {
    const response = await channel.send({ text: 'Four are pending.', threadId: 'ops-1' });

    expect(await response.json()).toEqual({ text: 'Four are pending.', threadId: 'ops-1' });
  });
});
