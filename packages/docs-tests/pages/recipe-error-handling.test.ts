import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { JanuxIntentError, component, createInstance, intent, jsx, renderToString, schema, str } from 'janux';
import { boot } from 'janux/client';
import { docExample } from '../doc-example';

/**
 * The documented Payment island driven through the intent pipeline (codes,
 * partial writes, audit) plus the runtime's janux:error event on a corrupt
 * snapshot. The HTTP half lives in recipe-error-handling-api.test.ts.
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
