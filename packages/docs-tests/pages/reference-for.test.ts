import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

// Another page test in this run may already own the global DOM; whoever
// registered it is the one that unregisters it.
const ownsDom = (() => {
  try {
    GlobalRegistrator.register({ url: 'https://app.test/' });

    return true;
  } catch {
    return false;
  }
})();

const { For, toRaw, jsx, signal, watch, createRoot } = await import('janux');
const { reconcile } = await import('../../janux/src/client/reconcile');
const { flushRenders } = await import('../../janux/src/runtime/render-queue');
const { createReactiveState } = await import('../../janux/src/state/reactive-state');
const { renderToString } = await import('janux/server');

afterAll(() => {
  if (ownsDom) GlobalRegistrator.unregister();
});

const pass = () => ({
  parent: { name: 'p', key: '1' },
  seq: new Map(),
  used: new Set<string>(),
  islands: [] as unknown[],
  foreigns: [] as unknown[],
});

interface Row {
  id: number;
  label: string;
  done?: boolean;
}

/** The island-shaped render loop the page describes: ONE effect over the whole view. */
function island(root: Element, view: () => unknown): () => number {
  let renders = 0;

  createRoot(() =>
    watch(() => {
      renders += 1;
      reconcile(root, view(), pass() as any);
    }),
  );

  return () => renders;
}

describe('reference/for.md', () => {
  it('gives every row its own scope: one row changing re-renders only that row', () => {
    const root = document.createElement('ul');
    const rows = signal<Row[]>([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ]);
    const bodies: number[] = [];
    const renders = island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => {
          bodies.push(row.id);

          return jsx('li', { children: row.label });
        },
      }),
    );

    expect(bodies).toEqual([1, 2, 3]);
    bodies.length = 0;
    // The documented update shape: REPLACE the row object.
    rows.value = rows.value.map((row) => (row.id === 2 ? { ...row, label: 'changed' } : row));
    flushRenders();
    expect(bodies).toEqual([2]);
    expect([...root.children].map((el) => el.textContent)).toEqual(['a', 'changed', 'c']);
    expect(renders()).toBe(2);
  });

  it('moves the live nodes across a permutation instead of rebuilding them', () => {
    const root = document.createElement('ul');
    const rows = signal<Row[]>([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]);

    island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => jsx('li', { children: row.label }),
      }),
    );
    const [first, second] = [...root.children];

    // Fresh objects with the same ids — what a state write produces, since it clones.
    rows.value = [
      { id: 2, label: 'b' },
      { id: 1, label: 'a' },
    ];
    flushRenders();
    expect(root.children[0]).toBe(second!);
    expect(root.children[1]).toBe(first!);
  });

  it('mutating an item in place does NOT update its row; replacing it does', () => {
    const root = document.createElement('ul');
    const rows = signal<Row[]>([{ id: 1, label: 'a', done: false }]);

    island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => jsx('li', { children: row.done === true ? `${row.label}!` : row.label }),
      }),
    );
    expect(root.textContent).toBe('a');

    // Even re-publishing the list does not help: the ITEM is the same object,
    // so the row it rendered and the row it is handed are indistinguishable.
    rows.value.at(0)!.done = true;
    rows.value = [...rows.value];
    flushRenders();
    expect(root.textContent).toBe('a');

    // A replacement IS visible — and it carries the mutation that was invisible
    // on its own, because the row finally re-reads its item.
    rows.value = rows.value.map((row) => (row.id === 1 ? { ...row, label: 'b' } : row));
    flushRenders();
    expect(root.textContent).toBe('b!');
  });

  it('the index is an accessor, so a row that ignores it survives a permutation', () => {
    const root = document.createElement('ul');
    const rows = signal<Row[]>([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]);
    const bodies: number[] = [];

    island(root, () =>
      jsx(For, {
        each: rows.value,
        by: (row: Row) => row.id,
        children: (row: Row) => {
          bodies.push(row.id);

          return jsx('li', { children: row.label });
        },
      }),
    );
    bodies.length = 0;
    rows.value = [
      { id: 2, label: 'b' },
      { id: 1, label: 'a' },
    ];
    flushRenders();
    expect(bodies).toEqual([]);
  });

  it('refuses a row body that renders more than one node', () => {
    const root = document.createElement('ul');

    expect(() =>
      reconcile(
        root,
        jsx(For, {
          each: [{ id: 1, label: 'a' }],
          by: (row: Row) => row.id,
          children: () => [jsx('li', {}), jsx('li', {})],
        }),
        pass() as any,
      ),
    ).toThrow(/exactly one/);
  });

  it('renders on the server as the rows it expands to', async () => {
    const { html } = await renderToString(
      jsx('ul', {
        children: jsx(For, {
          each: [
            { id: 1, label: 'a' },
            { id: 2, label: 'b' },
          ],
          by: (row: Row) => row.id,
          children: (row: Row) => jsx('li', { children: row.label }),
        }),
      }),
    );

    expect(html).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('toRaw hands back the plain value behind a state proxy', () => {
    const state = createReactiveState<{ rows: Row[] }>({ rows: [{ id: 1, label: 'a' }] });
    const rows = toRaw(state.proxy.rows);

    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]!.label).toBe('a');
    // Plain data, not a proxy: reading it back through `toRaw` is idempotent.
    expect(toRaw(rows)).toBe(rows);
    expect(toRaw('plain')).toBe('plain');
  });
});
