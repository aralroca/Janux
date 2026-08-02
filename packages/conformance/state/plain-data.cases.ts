import { createReactiveState } from '../../janux/src/state/reactive-state';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The serialization boundary of state: what a write may carry, what it turns
 * into, and how thoroughly it detaches from its source.
 *
 * State is schema-typed plain data. A non-plain container flattens to its own
 * enumerable entries (a Map's are internal, so it flattens to `{}`), while a
 * value that cannot exist in plain data at all — a function, a symbol — is
 * rejected at the write, where the error can still name the path. Storing it
 * "successfully" only to have `snapshot()` explode later with a nameless
 * DataCloneError is the failure mode these cases exist to prevent.
 */

/** A state whose gate is already open, for cases that are not about the gate. */
function open<T extends object>(initial: T) {
  const gate = createGate();
  const state = createReactiveState(initial, gate);

  return { state, mutate: <R>(fn: () => R) => withGate(gate, fn) };
}

export const PLAIN_DATA_CASES: ScenarioCase[] = [
  // ── non-plain containers flatten to their enumerable entries ────────────────
  {
    id: 'state-a-map-value-flattens-to-a-plain-empty-object',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      mutate(() => (state.proxy.lookup = new Map([['k', 1]])));
      log.push(JSON.stringify(state.snapshot().lookup));
    },
    expected: ['{}'],
  },
  {
    id: 'state-a-set-value-flattens-to-a-plain-empty-object',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      mutate(() => (state.proxy.seen = new Set([1, 2])));
      log.push(JSON.stringify(state.snapshot().seen));
    },
    expected: ['{}'],
  },
  {
    id: 'state-a-date-value-flattens-to-a-plain-empty-object',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      mutate(() => (state.proxy.at = new Date(0)));
      log.push(JSON.stringify(state.snapshot().at));
    },
    expected: ['{}'],
  },
  {
    id: 'state-a-class-instance-is-stored-as-its-own-fields-without-its-prototype',
    src: 'janux',
    run: (log) => {
      class Point {
        x = 1;
        y = 2;
        length(): number {
          return 0;
        }
      }
      const { state, mutate } = open<Record<string, unknown>>({});

      mutate(() => (state.proxy.point = new Point()));
      const stored = state.snapshot().point as Record<string, unknown>;

      log.push(JSON.stringify(stored), `method:${String(stored.length)}`, `proto:${stored.constructor.name}`);
    },
    expected: ['{"x":1,"y":2}', 'method:undefined', 'proto:Object'],
  },
  {
    id: 'state-a-getter-on-a-written-object-is-materialized-into-data',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      let reads = 0;
      const source = {
        get computed(): number {
          reads += 1;

          return 5;
        },
      };

      mutate(() => (state.proxy.value = source));
      log.push(JSON.stringify(state.snapshot().value), `getter-runs:${reads}`);
    },
    expected: ['{"computed":5}', 'getter-runs:1'],
  },
  {
    id: 'state-symbol-keyed-properties-of-a-written-object-are-dropped',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const marker = Symbol('marker');

      mutate(() => (state.proxy.data = { x: 1, [marker]: 2 }));
      log.push(JSON.stringify(state.snapshot().data));
    },
    expected: ['{"x":1}'],
  },

  // ── functions and symbols are rejected at the write, with the path ──────────
  {
    id: 'state-storing-a-function-throws-at-the-write-not-at-the-snapshot',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      attempt(log, 'write', () => mutate(() => (state.proxy.handler = () => 1)));
      attempt(log, 'snapshot', () => state.snapshot());
    },
    expected: ['write:threw:Janux: cannot store a function in state ("handler")', 'snapshot:ok'],
  },
  {
    id: 'state-storing-a-symbol-value-throws-at-the-write',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      attempt(log, 'write', () => mutate(() => (state.proxy.token = Symbol('token'))));
      attempt(log, 'snapshot', () => state.snapshot());
    },
    expected: ['write:threw:Janux: cannot store a symbol in state ("token")', 'snapshot:ok'],
  },
  {
    id: 'state-a-function-nested-in-a-written-object-is-rejected-with-its-path',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      attempt(log, 'write', () => mutate(() => (state.proxy.cfg = { retries: 3, on: () => 1 })));
      log.push(`stored:${String(state.snapshot().cfg)}`);
    },
    expected: ['write:threw:Janux: cannot store a function in state ("cfg.on")', 'stored:undefined'],
  },
  {
    id: 'state-a-symbol-nested-in-an-array-is-rejected-with-its-index',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      attempt(log, 'write', () => mutate(() => (state.proxy.list = ['ok', Symbol('bad')])));
      log.push(`stored:${String(state.snapshot().list)}`);
    },
    expected: ['write:threw:Janux: cannot store a symbol in state ("list.1")', 'stored:undefined'],
  },
  {
    id: 'state-pushing-a-function-into-an-array-is-rejected',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [] as unknown[] });

      attempt(log, 'push', () => mutate(() => state.proxy.items.push(() => 1)));
      log.push(`length:${state.snapshot().items.length}`);
    },
    expected: ['push:threw:Janux: cannot store a function in state ("items")', 'length:0'],
  },
  {
    id: 'state-an-object-pushed-with-a-nested-function-names-the-nested-path',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [] as unknown[] });

      attempt(log, 'push', () => mutate(() => state.proxy.items.push({ on: () => 1 })));
      log.push(`length:${state.snapshot().items.length}`);
    },
    expected: ['push:threw:Janux: cannot store a function in state ("items.on")', 'length:0'],
  },

  // ── detachment: written data shares nothing with its source ─────────────────
  {
    id: 'state-a-written-object-is-detached-from-later-source-mutations',
    src: 'vue:reactive#clone-on-write',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const source = { n: 1 };

      mutate(() => (state.proxy.data = source));
      source.n = 99;
      log.push(`state:${(state.snapshot().data as { n: number }).n}`, `source:${source.n}`);
    },
    expected: ['state:1', 'source:99'],
  },
  {
    id: 'state-a-pushed-object-is-detached-from-its-source',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [] as { n: number }[] });
      const source = { n: 1 };

      mutate(() => state.proxy.items.push(source));
      source.n = 99;
      log.push(`state:${state.snapshot().items[0]!.n}`);
    },
    expected: ['state:1'],
  },
  {
    id: 'state-a-shared-reference-becomes-two-independent-copies',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ pair?: { a: { n: number }; b: { n: number } } }>({});
      const shared = { n: 1 };

      mutate(() => (state.proxy.pair = { a: shared, b: shared }));
      mutate(() => (state.proxy.pair!.a.n = 2));
      log.push(`a:${state.snapshot().pair!.a.n}`, `b:${state.snapshot().pair!.b.n}`);
    },
    expected: ['a:2', 'b:1'],
  },
  {
    id: 'state-a-value-shared-between-two-array-slots-is-not-a-cycle',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const shared = { n: 1 };

      attempt(log, 'write', () => mutate(() => (state.proxy.list = [shared, shared])));
      log.push(JSON.stringify(state.snapshot().list));
    },
    expected: ['write:ok', '[{"n":1},{"n":1}]'],
  },
  {
    id: 'state-a-frozen-source-object-does-not-freeze-state',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ cfg?: { n: number } }>({});

      mutate(() => (state.proxy.cfg = Object.freeze({ n: 1 })));
      attempt(log, 'write', () => mutate(() => (state.proxy.cfg!.n = 2)));
      log.push(`n:${state.snapshot().cfg!.n}`);
    },
    expected: ['write:ok', 'n:2'],
  },
  {
    id: 'state-a-proxy-subtree-from-another-instance-is-unwrapped-on-write',
    src: 'janux',
    run: (log) => {
      const donor = open({ user: { name: 'a' } });
      const taker = open<{ copy?: { name: string } }>({});

      taker.mutate(() => (taker.state.proxy.copy = donor.state.proxy.user));
      donor.mutate(() => (donor.state.proxy.user.name = 'b'));
      log.push(`copy:${taker.state.snapshot().copy!.name}`, `donor:${donor.state.snapshot().user.name}`);
    },
    expected: ['copy:a', 'donor:b'],
  },

  // ── scalars JSON mistreats are stored faithfully ─────────────────────────────
  {
    id: 'state-undefined-property-values-are-stored-and-readable',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ maybe?: string }>({});

      mutate(() => (state.proxy.maybe = undefined));
      log.push(`read:${String(state.proxy.maybe)}`, `present:${'maybe' in state.snapshot()}`);
    },
    expected: ['read:undefined', 'present:true'],
  },
  {
    id: 'state-null-is-stored-as-null-not-dropped',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ value: string | null }>({ value: 'x' });

      mutate(() => (state.proxy.value = null));
      log.push(`read:${String(state.proxy.value)}`, `json:${JSON.stringify(state.snapshot())}`);
    },
    expected: ['read:null', 'json:{"value":null}'],
  },
  {
    id: 'state-non-finite-numbers-survive-in-state',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, number>>({});

      mutate(() => {
        state.proxy.nan = Number.NaN;
        state.proxy.inf = Number.POSITIVE_INFINITY;
      });
      const snap = state.snapshot();

      log.push(`nan:${Number.isNaN(snap.nan)}`, `inf:${snap.inf}`);
    },
    expected: ['nan:true', 'inf:Infinity'],
  },
  {
    id: 'state-negative-zero-survives-a-write',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 0 });

      mutate(() => (state.proxy.n = -0));
      log.push(`is-negative-zero:${Object.is(state.snapshot().n, -0)}`);
    },
    expected: ['is-negative-zero:true'],
  },
  {
    id: 'state-a-sparse-array-written-into-state-keeps-its-hole',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const sparse = [1, 2];

      delete sparse[0];
      mutate(() => (state.proxy.items = sparse));
      const stored = state.snapshot().items as number[];

      log.push(`hole:${!('0' in stored)}`, `json:${JSON.stringify(stored)}`);
    },
    expected: ['hole:true', 'json:[null,2]'],
  },

  // ── snapshots are copies all the way down ────────────────────────────────────
  {
    id: 'state-each-snapshot-is-an-independent-deep-copy',
    src: 'janux',
    run: (log) => {
      const { state } = open({ user: { name: 'a' } });
      const first = state.snapshot();
      const second = state.snapshot();

      first.user.name = 'edited';
      log.push(`identity:${first === second}`, `second:${second.user.name}`, `state:${state.proxy.user.name}`);
    },
    expected: ['identity:false', 'second:a', 'state:a'],
  },
  {
    id: 'state-mutating-a-snapshot-array-does-not-touch-state',
    src: 'zustand:basic#getState-is-a-snapshot',
    run: (log) => {
      const { state } = open({ items: [1, 2] });
      const snap = state.snapshot();

      snap.items.push(3);
      log.push(`snap:${snap.items.length}`, `state:${state.proxy.items.length}`);
    },
    expected: ['snap:3', 'state:2'],
  },
];
