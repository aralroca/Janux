import { describe, expect, it } from 'bun:test';
import { effect } from '../signals';
import { createGate, withGate } from './mutation-gate';
import { createReactiveState, withLeafTracking } from './reactive-state';

/**
 * The structural fix for the benchmark log's regression #22: a binding thunk
 * reading `state.values[i]` traverses the container, and a plain tracked
 * read subscribes it to `values` — so a write to ANY field re-runs every
 * sibling binding. Inside `withLeafTracking` only the MAXIMAL paths a thunk
 * read subscribe. That loses nothing: `touch` bumps a written path's
 * descendants, so a container write always reaches the leaf's own signal.
 */
describe('withLeafTracking', () => {
  it('subscribes the leaf, not the containers on the way to it', () => {
    const gate = createGate();
    const state = createReactiveState({ user: { name: 'ada', email: 'a@x' } }, gate);
    let runs = 0;
    let seen = '';

    effect(() => {
      runs += 1;
      seen = withLeafTracking(() => state.proxy.user.name);
    });
    expect([runs, seen]).toEqual([1, 'ada']);
    withGate(gate, () => (state.proxy.user.email = 'b@x'));
    expect(runs).toBe(1);
    withGate(gate, () => (state.proxy.user.name = 'grace'));
    expect([runs, seen]).toEqual([2, 'grace']);
  });

  it('a container write still reaches the leaf subscriber', () => {
    const gate = createGate();
    const state = createReactiveState({ user: { name: 'ada' } }, gate);
    let seen = '';

    effect(() => {
      seen = withLeafTracking(() => state.proxy.user.name);
    });
    withGate(gate, () => (state.proxy.user = { name: 'hopper' } as any));
    expect(seen).toBe('hopper');
  });

  /** Regression #22, at its own layer: one write, one re-run — not one per sibling. */
  it('512 sibling bindings: one write re-runs exactly one', () => {
    const gate = createGate();
    const state = createReactiveState({ values: Array.from({ length: 512 }, () => '') }, gate);
    const runs = Array.from({ length: 512 }, () => 0);

    runs.forEach((_, index) => {
      effect(() => {
        runs[index]! += 1;
        withLeafTracking(() => state.proxy.values[index]);
      });
    });
    const before = runs.reduce((sum, n) => sum + n, 0);

    expect(before).toBe(512);
    withGate(gate, () => (state.proxy.values[3] = 'x'));
    expect(runs.reduce((sum, n) => sum + n, 0)).toBe(before + 1);
    expect(runs[3]).toBe(2);
  });

  /**
   * The frame is module-global because one thunk can read several states —
   * so entries must be keyed per instance: two states sharing the same path
   * STRING both subscribe, and neither suppresses the other's maximality.
   */
  it('tracks two states reading the same path string independently', () => {
    const gateA = createGate();
    const gateB = createGate();
    const a = createReactiveState({ user: { name: 'ada' } }, gateA);
    const b = createReactiveState({ user: { name: 'bee' } }, gateB);
    let runs = 0;
    let seen = '';

    effect(() => {
      runs += 1;
      seen = withLeafTracking(() => `${a.proxy.user.name}/${b.proxy.user.name}`);
    });
    expect(seen).toBe('ada/bee');
    withGate(gateA, () => (a.proxy.user.name = 'grace'));
    expect([runs, seen]).toEqual([2, 'grace/bee']);
    withGate(gateB, () => (b.proxy.user.name = 'hopper'));
    expect([runs, seen]).toEqual([3, 'grace/hopper']);
  });

  /** Without the frame, nothing changes: a plain tracked read keeps its container subscriptions. */
  it('reads outside the frame keep today’s behavior', () => {
    const gate = createGate();
    const state = createReactiveState({ user: { name: 'ada', email: 'a@x' } }, gate);
    let runs = 0;

    effect(() => {
      runs += 1;
      void state.proxy.user.name;
    });
    withGate(gate, () => (state.proxy.user.email = 'b@x'));
    expect(runs).toBe(2);
  });

  it('restores the previous frame on exit, exceptions included', () => {
    const gate = createGate();
    const state = createReactiveState({ a: 1, b: 2 }, gate);
    let runs = 0;

    effect(() => {
      runs += 1;
      try {
        withLeafTracking(() => {
          void state.proxy.a;
          throw new Error('boom');
        });
      } catch {
        // The frame is gone: this read subscribes the plain way.
      }
      void state.proxy.b;
    });
    expect(runs).toBe(1);
    withGate(gate, () => (state.proxy.b = 3));
    expect(runs).toBe(2);
    withGate(gate, () => (state.proxy.a = 9));
    expect(runs).toBe(3);
  });
});
