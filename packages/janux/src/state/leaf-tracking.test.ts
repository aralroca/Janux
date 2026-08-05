import { describe, expect, it } from 'bun:test';
import { computed, effect } from '../signals';
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

  /**
   * Dropping a container subscription is only sound while the container's
   * KEY SET is stable: a write that adds a key (or extends an array by
   * index, or deletes) is a write TO the container, and must notify like
   * one — exactly as push/splice already do.
   */
  it('a new key re-runs a binding that enumerates the container', () => {
    const gate = createGate();
    const state = createReactiveState<any>({ form: { a: 1 } }, gate);
    let seen = '';

    effect(() => {
      seen = withLeafTracking(() => JSON.stringify({ ...state.proxy.form }));
    });
    expect(seen).toBe('{"a":1}');
    withGate(gate, () => (state.proxy.form.b = 2));
    expect(seen).toBe('{"a":1,"b":2}');
    withGate(gate, () => delete state.proxy.form.a);
    expect(seen).toBe('{"b":2}');
  });

  it('an index append re-runs length and iteration bindings', () => {
    const gate = createGate();
    const state = createReactiveState<any>({ items: ['a', 'b'] }, gate);
    let length = 0;
    let joined = '';

    effect(() => {
      length = withLeafTracking(() => state.proxy.items.length);
    });
    effect(() => {
      joined = withLeafTracking(() => state.proxy.items.join('-'));
    });
    withGate(gate, () => {
      const items = state.proxy.items;

      items[items.length] = 'c';
    });
    expect([length, joined]).toEqual([3, 'a-b-c']);
    withGate(gate, () => (state.proxy.items.length = 1));
    expect([length, joined]).toEqual([1, 'a']);
  });

  /** A reactive scope created INSIDE a thunk must track for itself, not leak into the frame. */
  it('an effect or computed created inside a frame keeps its own subscriptions', () => {
    const gate = createGate();
    const state = createReactiveState({ a: 1, b: 1, n: 10 }, gate);
    let outer = 0;
    let inner = 0;
    let innerSeen = 0;
    let derived: { value: number } | undefined;

    effect(() => {
      outer += 1;
      withLeafTracking(() => {
        void state.proxy.a;
        if (outer === 1) {
          effect(() => {
            inner += 1;
            innerSeen = state.proxy.b;
          });
          derived = computed(() => state.proxy.n * 5);
          void derived.value;
        }

        return 0;
      });
    });
    withGate(gate, () => (state.proxy.b = 2));
    expect([outer, inner, innerSeen]).toEqual([1, 2, 2]);
    withGate(gate, () => (state.proxy.n = 20));
    expect(derived!.value).toBe(100);
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
