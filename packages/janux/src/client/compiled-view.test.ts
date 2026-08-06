import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://app.test/' });

const { component, intent, schema, int, str, obj, list } = await import('../index');
const { createInstance } = await import('../runtime/instance');
const { reconcile } = await import('./reconcile');
const { flushRenders } = await import('../runtime/render-queue');
const { jsx } = await import('../jsx-runtime');
const { effect: watch, createRoot } = await import('../signals');

afterAll(() => GlobalRegistrator.unregister());

const pass = () => ({
  parent: { name: 'p', key: '1' },
  seq: new Map(),
  used: new Set<string>(),
  islands: [] as any[],
  foreigns: [] as any[],
});

/** The island render loop: ONE effect over the whole view. */
function island(root: Element, view: () => unknown) {
  let renders = 0;
  const stop = createRoot((dispose) => {
    watch(() => {
      renders += 1;
      reconcile(root, view(), pass());
    });

    return dispose;
  });

  return { renders: () => renders, stop };
}

/**
 * The shape the binding-sites compiler emits (`{state.count}` →
 * `{() => (state.count)}`), driven end to end by REAL instance state: the
 * schema-typed proxy, the mutation gate and the intent pipeline — not bare
 * signals. This is the contract the compiler relies on: an intent write
 * lands as one DOM write and the view never re-runs.
 */
describe('a compiled view over instance state', () => {
  const def = component({
    name: 'compiled-card',
    state: schema({ count: int().default(0), user: obj({ name: str().default('ada') }) }),
    intents: {
      bump: intent({ run: ({ state }: any) => void (state.count += 1) }),
      rename: intent({ input: schema({ name: str() }), run: ({ state, input }: any) => void (state.user.name = input.name) }),
    },
    view: ({ state }: any) =>
      jsx('section', {
        'data-label': () => state.user.name,
        children: jsx('span', { children: () => state.count }),
      }),
  });

  it('updates one text node per intent write, without re-running the view', async () => {
    const root = document.createElement('div');
    const instance = createInstance(def);
    const loop = island(root, () => def.view!(instance.bag));

    expect(root.textContent).toBe('0');
    expect(loop.renders()).toBe(1);
    await instance.intents.bump!({});
    flushRenders();
    expect(root.textContent).toBe('1');
    await instance.intents.bump!({});
    flushRenders();
    expect(root.textContent).toBe('2');
    expect(loop.renders()).toBe(1);
    loop.stop();
  });

  /** Regression #22, through the render loop: sibling bindings must not fan out. */
  it('one field write re-runs one binding, not every sibling', async () => {
    const listDef = component({
      name: 'compiled-form',
      state: schema({ values: list(str()) }),
      intents: {
        set: intent({ input: schema({ at: int(), to: str() }), run: ({ state, input }: any) => void (state.values[input.at] = input.to) }),
      },
      view: () => null,
    });
    const root = document.createElement('div');
    const instance = createInstance(listDef, { initial: { values: Array.from({ length: 40 }, () => '') } });
    const calls = Array.from({ length: 40 }, () => 0);
    const loop = island(root, () =>
      jsx('form', {
        children: calls.map((_, index) =>
          jsx('output', {
            children: () => {
              calls[index]! += 1;

              return (instance.bag as any).state.values[index];
            },
          }),
        ),
      }),
    );
    const before = calls.reduce((sum, n) => sum + n, 0);

    await instance.intents.set!({ at: 3, to: 'x' });
    flushRenders();
    expect(root.querySelectorAll('output')[3]!.textContent).toBe('x');
    expect(calls.reduce((sum, n) => sum + n, 0)).toBe(before + 1);
    expect(loop.renders()).toBe(1);
    loop.stop();
  });

  it('updates a bound attribute from a nested path write, without re-running the view', async () => {
    const root = document.createElement('div');
    const instance = createInstance(def);
    const loop = island(root, () => def.view!(instance.bag));
    const el = root.firstElementChild!;

    expect(el.getAttribute('data-label')).toBe('ada');
    await instance.intents.rename!({ name: 'grace' });
    flushRenders();
    expect(el.getAttribute('data-label')).toBe('grace');
    expect(loop.renders()).toBe(1);
    loop.stop();
  });
});
