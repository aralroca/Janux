import { describe, expect, it } from 'bun:test';
import { int, schema } from 'janux';
import { clientApi } from 'janux/client';
import { api, createJanuxServer } from '@janux/server';

/**
 * The HTTP half of recipes/error-handling.md: the status each failure maps to,
 * and what survives the wire into the generated client stub.
 */

describe('recipes/error-handling.md — the api() envelope', () => {
  const declining = api({
    input: schema({ cents: int().min(1) }),
    run: async () => {
      throw new Error('gateway down');
    },
  });
  const locked = api({ guard: 'forbidden', run: async () => 'gone' });
  const post = (name: string, body: unknown, headers: Record<string, string> = {}) =>
    createJanuxServer({ apis: { payments: { charge: declining, wipe: locked } } }).fetch(
      new Request(`http://x/_janux/api/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    );

  it('400 when the input schema rejects', async () => {
    const response = await post('payments.charge', { cents: 0 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('403 when an agent calls a forbidden api', async () => {
    expect((await post('payments.wipe', {}, { 'x-janux-origin': 'agent' })).status).toBe(403);
  });

  it('404 for an unknown api name', async () => {
    expect((await post('payments.nope', {})).status).toBe(404);
  });

  it('500 for anything run threw', async () => {
    const response = await post('payments.charge', { cents: 500 });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('gateway down');
  });

  it('the client stub throws the server message and loses the code', async () => {
    const original = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'JanuxIntentError: forbidden' }), { status: 403 })) as any;
    const error = await clientApi('payments.charge')({}).catch((reason: unknown) => reason);

    globalThis.fetch = original;

    expect((error as Error).message).toBe('JanuxIntentError: forbidden');
    expect((error as any).code).toBeUndefined();
  });
});
