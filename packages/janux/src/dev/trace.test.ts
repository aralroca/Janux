import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { component, effect, intent, source } from '../define/factories';
import { createInstance } from '../runtime/instance';
import { onJanuxError, type JanuxErrorChain } from './error-channel';

/**
 * Any framework can show the stack of a `throw`. These assertions are about the
 * sentence around it: which island, which declared behavior, evaluated under
 * which guard, on whose behalf — the part only Janux can answer, because every
 * invocation goes through one pipeline.
 *
 * `import.meta.env?.DEV` is Vite's flag and Bun reads `import.meta.env` straight
 * off `process.env`, so this is how a bun test opts into the dev paths. The
 * production build eliminates them entirely — see `dev-overlay-free` in
 * `packages/janux-cli/src/bundle-size.test.ts`.
 */

function captureChains() {
  const seen: { error: unknown; chain: JanuxErrorChain }[] = [];
  const stop = onJanuxError((error, chain) => seen.push({ error, chain }));

  return { seen, stop };
}

const failing = (message: string) => () => {
  throw new Error(message);
};

beforeEach(() => {
  process.env.DEV = 'true';
});

afterEach(() => {
  delete process.env.DEV;
});

describe('the Janux chain of a failing intent', () => {
  const cart = component({
    name: 'cart',
    view: () => null,
    intents: {
      checkout: intent({
        guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'),
        run: failing('payment gateway is down'),
      }),
    },
  });

  it('names the island, the intent, the guard and the origin', async () => {
    const { seen, stop } = captureChains();
    const instance = createInstance(cart, { key: 'main' });

    await expect(instance.intents.checkout!()).rejects.toThrow('payment gateway is down');
    stop();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.chain).toEqual({
      kind: 'intent',
      component: 'cart',
      name: 'checkout',
      island: 'ui://cart#main',
      origin: 'human',
      guard: 'auto',
      input: undefined,
    });
  });

  /**
   * The guard is what the pipeline decided for *this* caller, not what was
   * declared — which is the difference between "it threw" and "the agent was
   * never allowed to run it".
   */
  it('reports a refusal as the guard that refused it', async () => {
    const { seen, stop } = captureChains();
    const guarded = component({
      name: 'cart',
      view: () => null,
      intents: {
        checkout: intent({ guard: ({ origin }) => (origin === 'agent' ? 'forbidden' : 'auto'), run: () => null }),
      },
    });
    const instance = createInstance(guarded, { key: 'main' });

    await expect(instance.intents.checkout!({}, { origin: 'agent' })).rejects.toThrow('is not available');
    stop();

    expect(seen[0]!.chain.origin).toBe('agent');
    expect(seen[0]!.chain.guard).toBe('forbidden');
  });

  /** A `confirm` guard defers the run to a human approval — the failure of *that* run is explained too. */
  it('explains an approved proposal that fails, still under its confirm guard', async () => {
    const { seen, stop } = captureChains();
    const proposals: { execute: () => Promise<unknown> }[] = [];
    const instance = createInstance(cart, { key: 'main', onProposal: (proposal) => proposals.push(proposal) });

    await instance.intents.checkout!({}, { origin: 'agent' });
    await expect(proposals[0]!.execute()).rejects.toThrow('payment gateway is down');
    stop();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.chain).toMatchObject({ name: 'checkout', origin: 'agent', guard: 'confirm' });
  });

  /** The overlay watches; it never owns the failure. */
  it('rethrows the original error object, untouched', async () => {
    const { seen, stop } = captureChains();
    const instance = createInstance(cart, {});
    const thrown = await instance.intents.checkout!().catch((error: unknown) => error);

    stop();

    expect(seen[0]!.error).toBe(thrown);
    expect((thrown as Error).stack).toBeString();
  });

  it('publishes nothing outside dev', async () => {
    delete process.env.DEV;
    const { seen, stop } = captureChains();
    const instance = createInstance(cart, {});

    await expect(instance.intents.checkout!()).rejects.toThrow();
    stop();

    expect(seen).toEqual([]);
  });
});

describe('the Janux chain of a failing effect or source', () => {
  it('names the effect that threw', async () => {
    const { seen, stop } = captureChains();
    const def = component({
      name: 'cart',
      view: () => null,
      effects: { syncTotals: effect({ run: failing('no totals endpoint') }) },
    });

    await expect(createInstance(def, { key: 'main' }).attach()).rejects.toThrow('no totals endpoint');
    stop();

    expect(seen[0]!.chain).toEqual({ kind: 'effect', component: 'cart', name: 'syncTotals', island: 'ui://cart#main' });
  });

  /** A source failure is caught into `reader.error` — it must still be explained, and still be caught. */
  it('names the source that threw without changing where the error lands', async () => {
    const { seen, stop } = captureChains();
    const def = component({
      name: 'cart',
      view: () => null,
      sources: { catalog: source({ query: failing('catalog 503') }) },
    });
    const instance = createInstance(def, {});

    await instance.attach();
    await instance.settled();
    stop();

    expect(seen[0]!.chain).toEqual({ kind: 'source', component: 'cart', name: 'catalog', island: 'ui://cart' });
    expect(String(instance.sources.catalog!.error)).toContain('catalog 503');
  });

  /** Stores are islands too — the scheme is what tells the overlay which kind it is looking at. */
  it('uses the store:// scheme for a store', async () => {
    const { seen, stop } = captureChains();
    const def = { kind: 'store' as const, name: 'session', effects: { boot: effect({ run: failing('nope') }) } };

    await expect(createInstance(def).attach()).rejects.toThrow('nope');
    stop();

    expect(seen[0]!.chain.island).toBe('store://session');
  });
});
