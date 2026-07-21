import { describe, expect, it, mock } from 'bun:test';
import { effect } from '../signals';
import { allowMutations } from './mutation-gate';
import { createReactiveState } from './reactive-state';

const initial = () => ({
  items: [{ id: 'a', qty: 1 }],
  coupon: null as string | null,
});

describe('reactive state', () => {
  it('reads initial data through the proxy', () => {
    const state = createReactiveState(initial());

    expect(state.proxy.items[0]!.qty).toBe(1);
    expect(state.proxy.coupon).toBe(null);
  });

  it('throws on mutation outside a run context', () => {
    const state = createReactiveState(initial());

    expect(() => {
      state.proxy.coupon = 'SAVE10';
    }).toThrow(/illegal mutation of "coupon"/);
    expect(() => state.proxy.items.push({ id: 'b', qty: 2 })).toThrow(/illegal mutation/);
  });

  it('mutates inside allowMutations and notifies path readers', () => {
    const state = createReactiveState(initial());
    const runs = mock(() => {});

    effect(() => {
      runs();
      state.proxy.items[0]!.qty;
    });
    allowMutations(() => {
      state.proxy.items[0]!.qty = 5;
    });
    expect(runs).toHaveBeenCalledTimes(2);
    expect(state.snapshot().items[0]!.qty).toBe(5);
  });

  it('notifies list readers on push and filter-reassign', () => {
    const state = createReactiveState(initial());
    const lengths: number[] = [];

    effect(() => {
      lengths.push(state.proxy.items.length);
    });
    allowMutations(() => {
      state.proxy.items.push({ id: 'b', qty: 2 });
    });
    allowMutations(() => {
      state.proxy.items = state.proxy.items.filter((item) => item.id === 'b');
    });
    expect(lengths).toEqual([1, 2, 1]);
    expect(state.snapshot().items).toEqual([{ id: 'b', qty: 2 }]);
  });

  it('does not notify readers of untouched sibling paths', () => {
    const state = createReactiveState(initial());
    const runs = mock(() => {});

    effect(() => {
      runs();
      state.proxy.coupon;
    });
    allowMutations(() => {
      state.proxy.items[0]!.qty = 9;
    });
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('snapshot is plain data detached from the proxy', () => {
    const state = createReactiveState(initial());
    const snap = state.snapshot();

    snap.items[0]!.qty = 99;
    expect(state.proxy.items[0]!.qty).toBe(1);
    expect(JSON.parse(JSON.stringify(snap)).items[0].qty).toBe(99);
  });

});
