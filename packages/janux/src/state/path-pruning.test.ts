import { describe, expect, it } from 'bun:test';
import { effect, untrack } from '../signals';
import { createGate, withGate } from './mutation-gate';
import { createReactiveState } from './reactive-state';

describe('path pruning (reactivity scaling)', () => {
  it('reclaims transiently-read paths; writes stay bounded on high-churn stores', () => {
    const gate = createGate();
    const state = createReactiveState({ items: {} as Record<string, { v: number }> }, gate);

    withGate(gate, () => {
      // High churn: 2000 distinct keys read transiently (no subscribers) + written.
      for (let index = 0; index < 2000; index += 1) {
        const key = `k${index}`;

        (state.proxy.items as any)[key] = { v: index };
        untrack(() => (state.proxy.items as any)[key].v);
        delete (state.proxy.items as any)[key];
      }
    });
    // Without pruning this would be >4000 tracked paths.
    expect(state.stats().paths).toBeLessThan(600);
  });

  it('keeps subscribed paths alive and notification correct across prunes', () => {
    const gate = createGate();
    const state = createReactiveState({ hot: { n: 0 }, cold: {} as Record<string, number> }, gate);
    const seen: number[] = [];

    effect(() => {
      seen.push(state.proxy.hot.n);
    });
    withGate(gate, () => {
      for (let index = 0; index < 600; index += 1) {
        (state.proxy.cold as any)[`c${index}`] = index;
        delete (state.proxy.cold as any)[`c${index}`];
      }
      state.proxy.hot.n = 42;
    });
    expect(seen).toContain(42);
    // The subscribed path survived every sweep.
    withGate(gate, () => {
      state.proxy.hot.n = 43;
    });
    expect(seen).toContain(43);
  });
});
