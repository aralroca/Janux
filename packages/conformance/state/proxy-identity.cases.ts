import { createReactiveState } from '../../janux/src/state/reactive-state';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { watch } from 'janux';
import { type ScenarioCase } from '../support/scenario';

/**
 * Referential identity of the proxy is part of the contract: `foreign()` hands
 * these objects to React, whose whole ecosystem memoizes on identity. An
 * unchanged subtree must hand back the very same object (structural sharing);
 * a changed subtree must not. These cases pin both directions, plus the
 * tracked-path bookkeeping (`stats()`) and its pruning sweep.
 */

/** A state whose gate is already open, for cases that are not about the gate. */
function open<T extends object>(initial: T) {
  const gate = createGate();
  const state = createReactiveState(initial, gate);

  return { state, mutate: <R>(fn: () => R) => withGate(gate, fn) };
}

export const PROXY_IDENTITY_CASES: ScenarioCase[] = [
  {
    id: 'state-two-reads-of-one-path-return-the-same-proxy',
    src: 'janux',
    run: (log) => {
      const { state } = open({ user: { name: 'a' } });

      log.push(`same:${state.proxy.user === state.proxy.user}`);
    },
    expected: ['same:true'],
  },
  {
    id: 'state-a-write-mints-a-new-identity-for-the-changed-subtree',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ user: { name: 'a' } });
      const before = state.proxy.user;

      mutate(() => (state.proxy.user.name = 'b'));
      log.push(`changed:${state.proxy.user !== before}`);
    },
    expected: ['changed:true'],
  },
  {
    id: 'state-an-untouched-sibling-keeps-its-identity-across-a-write',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ left: { n: 1 }, right: { n: 2 } });
      const rightBefore = state.proxy.right;

      mutate(() => (state.proxy.left.n = 9));
      log.push(`right-kept:${state.proxy.right === rightBefore}`);
    },
    expected: ['right-kept:true'],
  },
  {
    id: 'state-the-root-proxy-is-one-stable-object-for-the-life-of-the-state',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 1, nested: { m: 2 } });
      const root = state.proxy;

      mutate(() => (state.proxy.n = 2));
      mutate(() => (state.proxy.nested.m = 3));
      log.push(`stable:${state.proxy === root}`);
    },
    expected: ['stable:true'],
  },
  {
    id: 'state-a-deep-write-changes-every-ancestor-identity-below-the-root',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ a: { b: { c: 1 } } });
      const aBefore = state.proxy.a;
      const bBefore = state.proxy.a.b;

      mutate(() => (state.proxy.a.b.c = 2));
      log.push(`a-changed:${state.proxy.a !== aBefore}`, `b-changed:${state.proxy.a.b !== bBefore}`);
    },
    expected: ['a-changed:true', 'b-changed:true'],
  },
  {
    id: 'state-push-renews-the-array-identity',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [1] });
      const before = state.proxy.items;

      mutate(() => state.proxy.items.push(2));
      log.push(`changed:${state.proxy.items !== before}`);
    },
    expected: ['changed:true'],
  },
  {
    id: 'state-push-renews-untouched-element-identities-too',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [{ n: 1 }] });
      const firstBefore = state.proxy.items[0];

      mutate(() => state.proxy.items.push({ n: 2 }));
      log.push(`first-renewed:${state.proxy.items[0] !== firstBefore}`);
    },
    expected: ['first-renewed:true'],
  },
  {
    id: 'state-a-destructured-subtree-is-the-same-object-a-later-read-returns',
    src: 'janux',
    run: (log) => {
      const { state } = open({ user: { name: 'a' } });
      const { user } = state.proxy;

      log.push(`same:${user === state.proxy.user}`);
    },
    expected: ['same:true'],
  },
  {
    id: 'state-a-sibling-write-keeps-a-nested-identity-under-the-untouched-branch',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ left: { inner: { n: 1 } }, right: { n: 2 } });
      const innerBefore = state.proxy.left.inner;

      mutate(() => (state.proxy.right.n = 9));
      log.push(`inner-kept:${state.proxy.left.inner === innerBefore}`);
    },
    expected: ['inner-kept:true'],
  },
  {
    id: 'state-pruning-reclaims-paths-nobody-watches',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({ keep: 0, temp: { deep: 1 } });

      (state.proxy.temp as { deep: number }).deep;
      log.push(`before:${state.stats().paths}`);
      mutate(() => {
        for (let index = 0; index < 256; index += 1) state.proxy.keep = index;
      });
      log.push(`after:${state.stats().paths}`);
    },
    expected: ['before:2', 'after:0'],
  },
  {
    id: 'state-pruning-spares-paths-with-a-live-watcher',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({ watched: 0, transient: 1 });

      watch(() => {
        state.proxy.watched;
      });
      state.proxy.transient;
      log.push(`before:${state.stats().paths}`);
      mutate(() => {
        for (let index = 0; index < 256; index += 1) state.proxy.watched = index;
      });
      log.push(`after:${state.stats().paths}`);
    },
    expected: ['before:2', 'after:1'],
  },
  {
    id: 'state-a-pruned-path-still-notifies-a-watcher-created-later',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({ n: 0, other: 0 });

      state.proxy.n;
      mutate(() => {
        for (let index = 0; index < 256; index += 1) state.proxy.other = index;
      });
      watch(() => {
        log.push(`run:${state.proxy.n}`);
      });
      mutate(() => (state.proxy.n = 7));
    },
    expected: ['run:0', 'run:7'],
  },
];
