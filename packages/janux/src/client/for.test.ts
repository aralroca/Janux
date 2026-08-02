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

interface Row {
  id: number;
  label: string;
}

const rowsOf = (ids: number[]): Row[] => ids.map((id) => ({ id, label: `r${id}` }));

/** One island-shaped render loop: a single effect that reconciles the whole view. */
function island(root: Element, view: () => unknown) {
  let renders = 0;

  const stop = createRoot(() =>
    watch(() => {
      renders += 1;
      reconcile(root, view(), pass());
    }),
  );

  return { stop, renders: () => renders };
}

const list = (root: Element) => [...root.children].map((el) => el.textContent);

describe('<For>', () => {
  it('renders one node per row', () => {
    const root = document.createElement('tbody');

    reconcile(
      root,
      jsx(For, {
        each: rowsOf([1, 2, 3]),
        by: (row: Row) => row.id,
        children: (row: Row) => jsx('tr', { children: row.label }),
      }),
      pass(),
    );
    expect(list(root)).toEqual(['r1', 'r2', 'r3']);
  });

  it('MOVES the live nodes across a permutation instead of rebuilding them', () => {
    const root = document.createElement('tbody');
    const rows = signal(rowsOf([1, 2, 3]));

    island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => jsx('tr', { children: row.label }),
      }),
    );
    const [first, second, third] = [...root.children];

    // A fresh array of EQUAL rows — what a state write produces (it clones).
    rows.value = rowsOf([3, 1, 2]);
    flushRenders();
    expect(root.children[0]).toBe(third!);
    expect(root.children[1]).toBe(first!);
    expect(root.children[2]).toBe(second!);
    expect(list(root)).toEqual(['r3', 'r1', 'r2']);
  });

  it('re-renders ONLY the rows whose data changed', () => {
    const root = document.createElement('tbody');
    const rows = signal(rowsOf([1, 2, 3]));
    const bodies: number[] = [];

    island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => {
          bodies.push(row.id);

          return jsx('tr', { children: row.label });
        },
      }),
    );
    expect(bodies).toEqual([1, 2, 3]);
    bodies.length = 0;
    const next = rowsOf([1, 2, 3]);

    next[1] = { id: 2, label: 'changed' };
    rows.value = next;
    flushRenders();
    expect(bodies).toEqual([2]);
    expect(list(root)).toEqual(['r1', 'changed', 'r3']);
  });

  it('does not re-render surviving rows when one is added or removed', () => {
    const root = document.createElement('tbody');
    const rows = signal(rowsOf([1, 2, 3]));
    const bodies: number[] = [];

    island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => {
          bodies.push(row.id);

          return jsx('tr', { children: row.label });
        },
      }),
    );
    bodies.length = 0;
    rows.value = rowsOf([1, 4, 2, 3]);
    flushRenders();
    expect(bodies).toEqual([4]);
    expect(list(root)).toEqual(['r1', 'r4', 'r2', 'r3']);
    bodies.length = 0;
    rows.value = rowsOf([1, 3]);
    flushRenders();
    expect(bodies).toEqual([]);
    expect(list(root)).toEqual(['r1', 'r3']);
  });

  it('re-renders a row when a signal only that row reads changes', () => {
    const root = document.createElement('tbody');
    const rows = signal(rowsOf([1, 2, 3]));
    const selected = signal(0);
    const bodies: number[] = [];
    const loop = island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => {
          bodies.push(row.id);

          return jsx('tr', { class: selected.value === row.id ? 'danger' : '', children: row.label });
        },
      }),
    );

    expect(loop.renders()).toBe(1);
    bodies.length = 0;
    selected.value = 2;
    flushRenders();
    // The LIST never re-ran: the read lives in the rows.
    expect(loop.renders()).toBe(1);
    expect(bodies).toEqual([1, 2, 3]);
    expect([...root.children].map((el) => el.className)).toEqual(['', 'danger', '']);
  });

  it('keeps a row scope alive across renders of the enclosing view', () => {
    const root = document.createElement('tbody');
    const rows = signal(rowsOf([1, 2]));
    const title = signal('a');
    const bodies: number[] = [];

    island(root, () => [
      jsx('h1', { children: title.value }),
      jsx('table', {
        children: jsx(For, {
          each: rows.value,
          by: (row: Row) => row.id,
          children: (row: Row) => {
            bodies.push(row.id);

            return jsx('tr', { children: row.label });
          },
        }),
      }),
    ]);
    bodies.length = 0;
    title.value = 'b';
    flushRenders();
    expect(bodies).toEqual([]);
    expect(root.querySelector('h1')!.textContent).toBe('b');
    expect(root.querySelectorAll('tr').length).toBe(2);
  });

  it('adopts the SSR rows on the first client render', () => {
    const root = document.createElement('tbody');

    root.innerHTML = '<tr><td>r1</td></tr><tr><td>r2</td></tr>';
    const [first, second] = [...root.children];

    reconcile(
      root,
      jsx(For, {
        each: rowsOf([1, 2]),
        by: (row: Row) => row.id,
        children: (row: Row) => jsx('tr', { children: jsx('td', { children: row.label }) }),
      }),
      pass(),
    );
    expect(root.children[0]).toBe(first!);
    expect(root.children[1]).toBe(second!);
  });

  it('disposes row scopes when the enclosing scope is disposed', () => {
    const root = document.createElement('tbody');
    const rows = signal(rowsOf([1, 2]));
    const selected = signal(0);
    const bodies: number[] = [];
    let stop = () => {};

    createRoot((dispose) => {
      stop = dispose;
      watch(() => {
        reconcile(
          root,
          jsx(For, {
            each: rows.value,
            by: (row: Row) => row.id,
            children: (row: Row) => {
              bodies.push(row.id);

              return jsx('tr', { class: selected.value === row.id ? 'x' : '', children: row.label });
            },
          }),
          pass(),
        );
      });
    });
    bodies.length = 0;
    stop();
    selected.value = 1;
    flushRenders();
    expect(bodies).toEqual([]);
  });

  it('disposes row scopes when the CONTAINER stops being rendered', () => {
    const root = document.createElement('div');
    const rows = signal(rowsOf([1, 2]));
    const shown = signal(true);
    const selected = signal(0);
    const bodies: number[] = [];
    const view = () =>
      shown.value
        ? jsx('ul', {
            children: jsx(For, {
              each: rows.value,
              by: (row: Row) => row.id,
              children: (row: Row) => {
                bodies.push(row.id);

                return jsx('li', { class: selected.value === row.id ? 'x' : '', children: row.label });
              },
            }),
          })
        : null;

    island(root, view);
    // The <ul> goes away and comes back: the first generation's rows must not
    // stay subscribed and re-rendering into detached nodes.
    shown.value = false;
    flushRenders();
    shown.value = true;
    flushRenders();
    bodies.length = 0;
    selected.value = 1;
    flushRenders();
    expect(bodies).toEqual([1, 2]);
    expect(root.querySelectorAll('li').length).toBe(2);
  });

  it('each={() => …} gives the list its own effect: the view stops re-rendering', () => {
    const root = document.createElement('div');
    const rows = signal(rowsOf([1, 2]));
    const bodies: number[] = [];
    const loop = island(root, () => [
      jsx('h1', { children: 'title' }),
      jsx('ul', {
        children: jsx(For, {
          each: () => rows.value,
          by: (row: Row) => row.id,
          children: (row: Row) => {
            bodies.push(row.id);

            return jsx('li', { children: row.label });
          },
        }),
      }),
    ]);

    expect(loop.renders()).toBe(1);
    bodies.length = 0;
    rows.value = rowsOf([1, 2, 3]);
    flushRenders();
    // The list re-diffed and built ONE row; the view around it never re-ran.
    expect(loop.renders()).toBe(1);
    expect(bodies).toEqual([3]);
    expect(root.querySelectorAll('li').length).toBe(3);
  });

  it('refuses a row body that renders more than one node', () => {
    const root = document.createElement('tbody');

    expect(() =>
      reconcile(
        root,
        jsx(For, {
          each: rowsOf([1]),
          by: (row: Row) => row.id,
          children: () => [jsx('tr', {}), jsx('tr', {})],
        }),
        pass(),
      ),
    ).toThrow(/exactly one element/);
  });

  it('expands to plain rows when called as a component (the SSR path)', () => {
    const out = For({
      each: rowsOf([1, 2]),
      by: (row: Row) => row.id,
      children: (row: Row) => jsx('tr', { children: row.label }),
    }) as any[];

    expect(out.map((node) => node.$p.children)).toEqual(['r1', 'r2']);
  });
});
