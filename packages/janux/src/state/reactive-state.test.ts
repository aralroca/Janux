import { describe, expect, it, mock } from 'bun:test';
import { effect } from '../signals';
import { createGate, withGate } from './mutation-gate';
import { createReactiveState } from './reactive-state';

const initial = () => ({
  items: [{ id: 'a', qty: 1 }],
  coupon: null as string | null,
});

describe('reactive state', () => {
  it('reads initial data through the proxy', () => {
    const gate = createGate();
    const state = createReactiveState(initial(), gate);

    expect(state.proxy.items[0]!.qty).toBe(1);
    expect(state.proxy.coupon).toBe(null);
  });

  it('throws on mutation outside a run context', () => {
    const gate = createGate();
    const state = createReactiveState(initial(), gate);

    expect(() => {
      state.proxy.coupon = 'SAVE10';
    }).toThrow(/illegal mutation of "coupon"/);
    expect(() => state.proxy.items.push({ id: 'b', qty: 2 })).toThrow(/illegal mutation/);
  });

  it('mutates inside allowMutations and notifies path readers', () => {
    const gate = createGate();
    const state = createReactiveState(initial(), gate);
    const runs = mock(() => {});

    effect(() => {
      runs();
      state.proxy.items[0]!.qty;
    });
    withGate(gate, () => {
      state.proxy.items[0]!.qty = 5;
    });
    expect(runs).toHaveBeenCalledTimes(2);
    expect(state.snapshot().items[0]!.qty).toBe(5);
  });

  it('notifies list readers on push and filter-reassign', () => {
    const gate = createGate();
    const state = createReactiveState(initial(), gate);
    const lengths: number[] = [];

    effect(() => {
      lengths.push(state.proxy.items.length);
    });
    withGate(gate, () => {
      state.proxy.items.push({ id: 'b', qty: 2 });
    });
    withGate(gate, () => {
      state.proxy.items = state.proxy.items.filter((item) => item.id === 'b');
    });
    expect(lengths).toEqual([1, 2, 1]);
    expect(state.snapshot().items).toEqual([{ id: 'b', qty: 2 }]);
  });

  it('does not notify readers of untouched sibling paths', () => {
    const gate = createGate();
    const state = createReactiveState(initial(), gate);
    const runs = mock(() => {});

    effect(() => {
      runs();
      state.proxy.coupon;
    });
    withGate(gate, () => {
      state.proxy.items[0]!.qty = 9;
    });
    expect(runs).toHaveBeenCalledTimes(1);
  });

  /**
   * Referential identity is a contract, not an implementation detail: React
   * memoization (`useMemo` deps, `React.memo`, and every library's internal memo
   * cache) is keyed on it, and `foreign()` hands this proxy straight to React.
   * A fresh identity per read makes "the data changed" true on every render,
   * which is an infinite render loop in any library that reacts to it. A
   * permanently stable one is the opposite bug — React never sees the change.
   * The contract is structural sharing: identity changes iff the subtree did.
   */
  describe('referential identity (structural sharing)', () => {
    it('returns the same object for repeated reads of the same path', () => {
      const gate = createGate();
      const state = createReactiveState(initial(), gate);

      expect(state.proxy).toBe(state.proxy);
      expect(state.proxy.items).toBe(state.proxy.items);
      expect(state.proxy.items[0]).toBe(state.proxy.items[0]);
    });

    it('gives a changed subtree a new identity', () => {
      const gate = createGate();
      const state = createReactiveState(initial(), gate);
      const before = state.proxy.items;
      const beforeRow = state.proxy.items[0];

      withGate(gate, () => {
        state.proxy.items[0]!.qty = 9;
      });
      expect(state.proxy.items[0]).not.toBe(beforeRow);
      // The ancestor changed too — a React consumer of `items` must re-render.
      expect(state.proxy.items).not.toBe(before);
    });

    it('leaves untouched siblings with their identity intact', () => {
      const gate = createGate();
      const state = createReactiveState(initial(), gate);
      const items = state.proxy.items;

      withGate(gate, () => {
        state.proxy.coupon = 'SAVE10';
      });
      // This is what stops a filter keystroke from invalidating 10 000 rows.
      expect(state.proxy.items).toBe(items);
    });
  });

  it('snapshot is plain data detached from the proxy', () => {
    const gate = createGate();
    const state = createReactiveState(initial(), gate);
    const snap = state.snapshot();

    snap.items[0]!.qty = 99;
    expect(state.proxy.items[0]!.qty).toBe(1);
    expect(JSON.parse(JSON.stringify(snap)).items[0].qty).toBe(99);
  });

});
