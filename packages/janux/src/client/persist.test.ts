import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createInstance } from '../runtime/instance';
import { store } from '../define/factories';
import { int, schema, str } from '../schema';
import { ensureStore, type MountContext } from './mount';
import { persistStore } from './persist';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const prefs = store({
  name: 'prefs',
  state: schema({ theme: str().default('light'), count: int() }),
  intents: {},
});

function makeInstance() {
  return createInstance(prefs, {});
}

describe('store persistence', () => {
  beforeEach(() => localStorage.clear());

  it('writes state back to storage on change', async () => {
    const instance = makeInstance();

    await instance.attach();
    const stop = await persistStore(instance);

    instance.patch({ theme: 'dark' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const raw = JSON.parse(localStorage.getItem('janux:store:prefs')!);

    expect(raw.s.theme).toBe('dark');
    stop();
  });

  it('rehydrates state from storage on mount', async () => {
    localStorage.setItem('janux:store:prefs', JSON.stringify({ v: 0, s: { theme: 'dark', count: 9 } }));
    const instance = makeInstance();

    await instance.attach();
    await persistStore(instance);
    expect((instance.state as any).theme).toBe('dark');
    expect((instance.state as any).count).toBe(9);
  });

  it('runs migrate when the stored version is older', async () => {
    localStorage.setItem('janux:store:prefs', JSON.stringify({ v: 0, s: { theme: 'legacy' } }));
    const instance = makeInstance();

    await instance.attach();
    await persistStore(instance, {
      version: 1,
      migrate: (persisted) => ({ ...persisted, theme: persisted.theme === 'legacy' ? 'dark' : persisted.theme }),
    });
    expect((instance.state as any).theme).toBe('dark');
  });

  it('partialize persists only selected fields', async () => {
    const instance = makeInstance();

    await instance.attach();
    const stop = await persistStore(instance, { partialize: (state) => ({ theme: state.theme }) });

    instance.patch({ count: 5 });
    instance.patch({ theme: 'dark' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const raw = JSON.parse(localStorage.getItem('janux:store:prefs')!);

    expect(raw.s).toEqual({ theme: 'dark' });
    stop();
  });
});

/**
 * Regression: a payload stored under a different `version` was applied anyway
 * when no `migrate` was given — the docs promised it would be dropped, and
 * booting with state the code no longer understands is the bug that promise
 * exists to prevent.
 */
describe('def-level persist config', () => {
  beforeEach(() => localStorage.clear());

  const mountContext = () =>
    ({
      registry: { stores: new Map(), snapshots: new Map() },
      bus: undefined,
      ctx: {},
      inflight: new Set(),
      onProposal: () => {},
    }) as unknown as MountContext;

  it('a persist config object on the def reaches persistStore (key + partialize)', async () => {
    const themed = store({
      name: 'themed',
      state: schema({ theme: str().default('light'), draft: str() }),
      intents: {},
      persist: { name: 'app:theme', partialize: (state: Record<string, unknown>) => ({ theme: state.theme }) },
    });
    const instance = await ensureStore(themed as any, mountContext());

    instance.patch({ theme: 'dark', draft: 'not persisted' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const raw = JSON.parse(localStorage.getItem('app:theme')!);

    expect(raw.s).toEqual({ theme: 'dark' });
    await instance.dispose();
  });

  it("persist: 'local' keeps its default key", async () => {
    const plain = store({
      name: 'plain-prefs',
      state: schema({ theme: str().default('light') }),
      intents: {},
      persist: 'local',
    });
    const instance = await ensureStore(plain as any, mountContext());

    instance.patch({ theme: 'dark' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(localStorage.getItem('janux:store:plain-prefs')).not.toBeNull();
    await instance.dispose();
  });
});

describe('persist versioning', () => {
  it('drops a payload from another version when there is no migrate', async () => {
    localStorage.setItem('v:test', JSON.stringify({ v: 0, s: { theme: 'stale' } }));
    const instance = createInstance(prefs);

    await instance.attach();
    await persistStore(instance as any, { name: 'v:test', version: 2 } as any);
    await Bun.sleep(5);

    expect(instance.snapshot().theme).not.toBe('stale');
  });

  it('applies it through migrate when one is given', async () => {
    localStorage.setItem('m:test', JSON.stringify({ v: 1, s: { legacy: true } }));
    const instance = createInstance(prefs);

    await instance.attach();
    await persistStore(instance as any, {
      name: 'm:test',
      version: 2,
      migrate: (stored: any) => ({ theme: stored.legacy ? 'dark' : 'light' }),
    } as any);
    await Bun.sleep(5);

    expect(instance.snapshot().theme).toBe('dark');
  });
});
