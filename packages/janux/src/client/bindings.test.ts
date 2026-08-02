import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://app.test/' });

const { reconcile } = await import('./reconcile');
const { flushRenders } = await import('../runtime/render-queue');
const { jsx } = await import('../jsx-runtime');
const { For } = await import('../for');
const { signal, effect: watch, createRoot } = await import('../signals');

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

describe('reactive prop bindings', () => {
  it('writes the attribute WITHOUT the view subscribing to what it reads', () => {
    const root = document.createElement('div');
    const flag = signal(false);
    const loop = island(root, () => jsx('p', { class: () => (flag.value ? 'on' : 'off'), children: 'x' }));

    expect(root.firstElementChild!.getAttribute('class')).toBe('off');
    expect(loop.renders()).toBe(1);
    flag.value = true;
    flushRenders();
    expect(root.firstElementChild!.getAttribute('class')).toBe('on');
    // The whole point: the VIEW never re-ran.
    expect(loop.renders()).toBe(1);
  });

  it('removes the attribute when the binding goes falsy, and restores it', () => {
    const root = document.createElement('div');
    const on = signal(true);

    island(root, () => jsx('p', { hidden: () => on.value, children: 'x' }));
    expect(root.firstElementChild!.hasAttribute('hidden')).toBe(true);
    on.value = false;
    flushRenders();
    expect(root.firstElementChild!.hasAttribute('hidden')).toBe(false);
    on.value = true;
    flushRenders();
    expect(root.firstElementChild!.hasAttribute('hidden')).toBe(true);
  });

  it('an attr diff does not reclaim an attribute a binding owns', () => {
    const root = document.createElement('div');
    const flag = signal(false);
    const title = signal('a');

    island(root, () => jsx('p', { title: title.value, class: () => (flag.value ? 'on' : 'off'), children: 'x' }));
    const el = root.firstElementChild!;

    expect(el.getAttribute('class')).toBe('off');
    // A view re-render runs the attr diff; `class` is not in its desired set.
    title.value = 'b';
    flushRenders();
    expect(el.getAttribute('title')).toBe('b');
    expect(el.getAttribute('class')).toBe('off');
  });

  it('re-runs with the newest closure when the view DOES re-render', () => {
    const root = document.createElement('div');
    const label = signal('a');

    island(root, () => {
      const current = label.value;

      return jsx('p', { title: () => `${current}!`, children: 'x' });
    });
    expect(root.firstElementChild!.getAttribute('title')).toBe('a!');
    label.value = 'b';
    flushRenders();
    expect(root.firstElementChild!.getAttribute('title')).toBe('b!');
  });

  it('keeps runtime classes a binding did not write', () => {
    const root = document.createElement('div');
    const flag = signal(false);

    island(root, () => jsx('p', { class: () => (flag.value ? 'on' : 'off'), children: 'x' }));
    root.firstElementChild!.classList.add('janux-glow');
    flag.value = true;
    flushRenders();
    expect(root.firstElementChild!.classList.contains('janux-glow')).toBe(true);
    expect(root.firstElementChild!.classList.contains('on')).toBe(true);
  });

  it('stops when the enclosing scope is disposed', () => {
    const root = document.createElement('div');
    const flag = signal(false);
    let stop = () => {};

    createRoot((dispose) => {
      stop = dispose;
      watch(() => reconcile(root, jsx('p', { class: () => (flag.value ? 'on' : 'off') }), pass()));
    });
    const el = root.firstElementChild!;

    stop();
    flag.value = true;
    flushRenders();
    expect(el.getAttribute('class')).toBe('off');
  });

  it('inside <For>: a shared signal rewrites one attribute per row, no row body re-runs', () => {
    const root = document.createElement('tbody');
    const rows = signal([1, 2, 3].map((id) => ({ id })));
    const selected = signal(0);
    const bodies: number[] = [];
    const loop = island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: { id: number }) => row.id,
        children: (row: { id: number }) => {
          bodies.push(row.id);

          return jsx('tr', { class: () => (selected.value === row.id ? 'danger' : ''), children: String(row.id) });
        },
      }),
    );

    bodies.length = 0;
    selected.value = 2;
    flushRenders();
    expect(loop.renders()).toBe(1);
    // No row body re-ran — only the three one-attribute effects did.
    expect(bodies).toEqual([]);
    expect([...root.children].map((el) => el.getAttribute('class'))).toEqual(['', 'danger', '']);
    selected.value = 3;
    flushRenders();
    expect(bodies).toEqual([]);
    expect([...root.children].map((el) => el.getAttribute('class'))).toEqual(['', '', 'danger']);
  });

  it('drives a controlled input property, not just its attribute', () => {
    const root = document.createElement('div');
    const text = signal('a');

    island(root, () => jsx('input', { value: () => text.value }));
    const el = root.firstElementChild as HTMLInputElement;

    expect(el.value).toBe('a');
    text.value = 'b';
    flushRenders();
    expect(el.value).toBe('b');
  });

  it('a thunk CHILD is a text binding: the view never re-renders for it', () => {
    const root = document.createElement('div');
    const count = signal(0);
    const loop = island(root, () => jsx('p', { children: ['n=', () => count.value] }));

    expect(root.textContent).toBe('n=0');
    count.value = 7;
    flushRenders();
    expect(root.textContent).toBe('n=7');
    expect(loop.renders()).toBe(1);
  });

  it('a text binding adopts the server-rendered text node', () => {
    const root = document.createElement('p');

    root.innerHTML = 'hello';
    const live = root.firstChild;
    const name = signal('hello');

    island(root, () => [() => name.value]);
    expect(root.firstChild).toBe(live);
    name.value = 'bye';
    flushRenders();
    expect(root.textContent).toBe('bye');
  });

  it('a text binding renders nullish and false as nothing', () => {
    const root = document.createElement('div');
    const value = signal<unknown>('x');

    island(root, () => jsx('p', { children: () => value.value }));
    expect(root.textContent).toBe('x');
    value.value = null;
    flushRenders();
    expect(root.textContent).toBe('');
    value.value = false;
    flushRenders();
    expect(root.textContent).toBe('');
    value.value = 0;
    flushRenders();
    expect(root.textContent).toBe('0');
  });

  it('an event prop is never a binding — it must name an intent', () => {
    const root = document.createElement('div');

    reconcile(root, jsx('button', { onClick: () => 'nope', children: 'x' }), pass());
    expect(root.firstElementChild!.hasAttribute('onclick')).toBe(false);
    expect(root.firstElementChild!.hasAttribute('data-jxa')).toBe(false);
  });
});
