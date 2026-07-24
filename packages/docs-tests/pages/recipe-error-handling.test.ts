import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { JanuxIntentError, component, createInstance, int, intent, jsx, renderToString, schema, str } from 'janux';
import { boot, clientApi } from 'janux/client';
import { api, createJanuxServer } from '@janux/server';
import { docExample } from '../doc-example';

/**
 * recipes/error-handling.md claims three distinct surfaces. All three run here:
 * the documented Payment island through the intent pipeline (codes, partial
 * writes, audit), the api() HTTP envelope status by status, and the runtime's
 * janux:error event on a corrupt snapshot.
 */

const STUB = {
  "import { chargeCard } from '../server/payments.api';":
    'const chargeCard = (vars: any) => (globalThis as any).__chargeCard(vars);',
};

let chargeCard: (vars: { cents: number }) => Promise<unknown> = async () => ({ id: 'r_1' });

(globalThis as any).__chargeCard = (vars: { cents: number }) => chargeCard(vars);

let Payment: any;

beforeAll(async () => {
  GlobalRegistrator.register({ url: 'http://localhost:3000/' });
  ({ Payment } = await docExample('apps/docs/content/recipes/error-handling.md', 0, STUB));
});

afterAll(() => GlobalRegistrator.unregister());

async function attached() {
  const instance = createInstance(Payment);

  await instance.attach();

  return instance;
}

describe('recipes/error-handling.md — the intent pipeline', () => {
  it('models the failure in state and still rethrows', async () => {
    chargeCard = async () => {
      throw new Error('card declined');
    };
    const instance = await attached();

    await expect(instance.intents.charge({ cents: 500 })).rejects.toThrow('card declined');
    expect(instance.snapshot()).toMatchObject({ status: 'failed', message: 'We could not charge your card.' });
    const { html } = await renderToString(jsx(Payment, {}), {});

    expect(html).toContain('class="idle"');
  });

  it('rejects invalid_input before run executes', async () => {
    const instance = await attached();
    const error = await instance.intents.charge({ cents: 0 }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(JanuxIntentError);
    expect((error as JanuxIntentError).code).toBe('invalid_input');
    expect(instance.snapshot().status).toBe('idle');
  });

  it('rejects not_ready while a charge is in flight', async () => {
    let finish = () => {};

    chargeCard = () => new Promise((resolve) => (finish = () => resolve({ id: 'r_2' })));
    const instance = await attached();
    const inFlight = instance.intents.charge({ cents: 500 });
    const error = await instance.intents.charge({ cents: 500 }).catch((reason: unknown) => reason);

    expect((error as JanuxIntentError).code).toBe('not_ready');

    finish();
    await inFlight;

    expect(instance.snapshot().status).toBe('paid');
  });

  it('keeps the writes made before the throw', async () => {
    const Partial = component({
      name: 'partial',
      state: schema({ status: str().default('idle') }),
      intents: {
        go: intent({
          run: ({ state }: any) => {
            state.status = 'charging';
            throw new Error('boom');
          },
        }),
      },
      view: () => jsx('p', {}),
    });
    const instance = createInstance(Partial);

    await instance.attach();

    await expect(instance.intents.go()).rejects.toThrow('boom');
    expect(instance.snapshot().status).toBe('charging');
  });

  it('audits failures with ok:false and the stringified error', async () => {
    const entries: any[] = [];

    chargeCard = async () => {
      throw new Error('card declined');
    };
    const instance = createInstance(Payment, { onAudit: (entry: any) => entries.push(entry) });

    await instance.attach();
    await instance.intents.charge({ cents: 500 }).catch(() => undefined);
    await instance.intents.charge({ cents: 0 }).catch(() => undefined);

    expect(entries.map((entry) => [entry.tool, entry.ok])).toEqual([
      ['payment.charge', false],
      ['payment.charge', false],
    ]);
    expect(entries[0].error).toBe('Error: card declined');
    expect(entries[1].error).toContain('Invalid input');
  });

  it('a human is not blocked by a forbidden guard — only the agent is', async () => {
    const Locked = component({
      name: 'locked',
      state: schema({ status: str().default('idle') }),
      intents: { wipe: intent({ guard: 'forbidden', run: ({ state }: any) => (state.status = 'wiped') }) },
      view: () => jsx('p', {}),
    });
    const instance = createInstance(Locked);

    await instance.attach();
    const error = await instance.intents.wipe(undefined, { origin: 'agent' }).catch((reason: unknown) => reason);

    expect((error as JanuxIntentError).code).toBe('forbidden');

    await instance.intents.wipe();

    expect(instance.snapshot().status).toBe('wiped');
  });
});

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

describe('recipes/error-handling.md — janux:error', () => {
  it('reports a corrupt state snapshot as a string detail', () => {
    const reported: unknown[] = [];

    document.addEventListener('janux:error', (event) => reported.push((event as CustomEvent).detail));
    document.body.innerHTML =
      '<script type="application/janux+state" data-uri="ui://payment#default">{not json}</script>';
    boot();

    expect(reported).toHaveLength(1);
    expect(typeof reported[0]).toBe('string');
    expect(reported[0]).toContain('payment');
  });
});
