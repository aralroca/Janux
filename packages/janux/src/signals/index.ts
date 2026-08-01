type Cleanup = (() => void) | undefined;

interface Runner {
  run: () => void;
  deps: Set<Set<Runner>>;
  /** Computed runners are pure and safe to flush early on a mid-batch read. */
  computed?: boolean;
}

export interface Sig<T> {
  value: T;
  peek(): T;
  /** Live subscriber count — lets owners reclaim signals nobody reads. */
  readers(): number;
}

export interface ReadonlySig<T> {
  readonly value: T;
  peek(): T;
  dispose(): void;
}

let active: Runner | null = null;
let batching: Set<Runner> | null = null;
let owner: Owner | null = null;

/** Disposal scope: effects/computeds created inside register here; child roots cascade. */
export interface Owner {
  cleanups: (() => void)[];
  disposed: boolean;
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const root: Owner = { cleanups: [], disposed: false };
  const dispose = () => {
    if (root.disposed) return;
    root.disposed = true;
    // Untracked: a dispose triggered from inside a running effect must not let
    // the cleanups' signal reads subscribe that effect.
    untrack(() => root.cleanups.splice(0).reverse().forEach((cleanup) => cleanup()));
  };

  owner?.cleanups.push(dispose);

  return runWithOwner(root, () => fn(dispose));
}

export function onCleanup(fn: () => void): void {
  // On an already-disposed scope the cleanup runs immediately — never silently dropped.
  if (owner?.disposed) return untrack(fn);
  owner?.cleanups.push(fn);
}

export function getOwner(): Owner | null {
  return owner;
}

export function runWithOwner<T>(scope: Owner | null, fn: () => T): T {
  const previous = owner;

  owner = scope;
  try {
    return fn();
  } finally {
    owner = previous;
  }
}

function track(subs: Set<Runner>): void {
  if (active === null) return;

  subs.add(active);
  active.deps.add(subs);
}

function notify(subs: Set<Runner>): void {
  // Nothing reads this signal: no queue to seed, no drain to run. Worth the
  // check because a single state write bumps the path, its descendants and
  // every ancestor, and most of those signals have no reader at all.
  if (subs.size === 0) return;
  if (batching !== null) {
    subs.forEach((runner) => batching!.add(runner));

    return;
  }
  // Every write flushes through the same queue a batch uses: computeds settle
  // before any effect runs, so a diamond (a → b, a → c, effect reads b + c)
  // never shows an effect one fresh branch and one stale one, and a cascade
  // re-queues an already-queued effect instead of running it twice.
  batching = new Set(subs);
  drain();
}

/** Runs queued computeds to a fixed point, then effects one at a time. */
function drain(): void {
  const queue = batching!;

  try {
    for (;;) {
      flushComputeds(queue);
      const next = queue.values().next();

      if (next.done) return;
      queue.delete(next.value);
      next.value.run();
    }
  } finally {
    batching = null;
  }
}

/** Computeds are pure by contract, so settling them early is unobservable. */
function flushComputeds(queue: Set<Runner>): void {
  let ran = true;

  while (ran) {
    ran = false;
    for (const runner of [...queue]) {
      if (!runner.computed) continue;
      queue.delete(runner);
      runner.run();
      ran = true;
    }
  }
}

function detach(runner: Runner): void {
  runner.deps.forEach((subs) => subs.delete(runner));
  runner.deps.clear();
}

export function signal<T>(initial: T): Sig<T> {
  const subs = new Set<Runner>();
  let current = initial;

  return {
    get value(): T {
      track(subs);

      return current;
    },
    set value(next: T) {
      if (Object.is(next, current)) return;
      current = next;
      notify(subs);
    },
    peek: () => current,
    readers: () => subs.size,
  };
}

function runTracked(runner: Runner, fn: () => Cleanup): Cleanup {
  const previous = active;

  detach(runner);
  active = runner;
  try {
    return fn();
  } finally {
    active = previous;
  }
}

/**
 * `schedule` defers re-runs (never the first one) to whenever it calls back —
 * the seam the client render loop uses to collapse a burst of writes into one
 * render. It must dedupe: a runner notified twice before it runs is scheduled
 * twice.
 */
export function effect(fn: () => Cleanup | void, schedule?: (run: () => void) => void): () => void {
  let cleanup: Cleanup;
  let disposed = false;
  const scope = owner;
  const runner: Runner = { deps: new Set(), run: () => {} };

  // Re-runs restore the creation-time owner and never outlive dispose — a
  // runner already queued in a notify/batch when its island is torn down
  // must not re-subscribe as a zombie.
  const runEffect = function runEffect() {
    if (disposed) return;
    const previous = cleanup;

    // Cleared BEFORE it runs, so a throwing cleanup can never run twice — the
    // next notification re-runs the effect body instead of the dead cleanup.
    // Untracked, so its signal reads never subscribe whatever effect is active.
    cleanup = undefined;
    if (previous) untrack(previous);
    // Only a FUNCTION is a cleanup: `watch(() => (title.value = x))` returns a
    // string through the arrow's implicit return, and calling that would throw.
    const result = runWithOwner(scope, () => runTracked(runner, fn as () => Cleanup));

    // An effect that disposed itself mid-run re-subscribed while finishing and
    // just returned a fresh cleanup nothing will ever call: release both now.
    if (disposed) {
      detach(runner);
      if (typeof result === 'function') untrack(result);

      return;
    }
    cleanup = typeof result === 'function' ? result : undefined;
  };

  runner.run = schedule === undefined ? runEffect : () => schedule(runEffect);
  // The first run is always synchronous: a scheduled island must still paint
  // its initial view before mount returns.
  runEffect();
  const dispose = function dispose() {
    if (disposed) return;
    disposed = true;
    const previous = cleanup;

    cleanup = undefined;
    detach(runner);
    if (previous) untrack(previous);
  };

  owner?.cleanups.push(dispose);

  return dispose;
}

export function computed<T>(fn: () => T): ReadonlySig<T> {
  const out = signal<T>(undefined as T);
  let disposed = false;
  const scope = owner;
  const runner: Runner = { deps: new Set(), run: () => {} };

  runner.run = function runComputed() {
    if (disposed) return;
    out.value = runWithOwner(scope, () => runTracked(runner, fn as () => Cleanup)) as T;
  };
  runner.computed = true;
  runner.run();
  const dispose = function dispose() {
    if (disposed) return;
    disposed = true;
    detach(runner);
  };

  owner?.cleanups.push(dispose);
  // A batch queues this runner like any other; a read mid-batch must not see
  // the pre-batch value, so pending recomputes run on demand (pull) and leave
  // the queue with nothing to redo. ALL queued computed runners flush, to a
  // fixed point: a chain (c2 reads c1 reads a) only queues c2 once c1 has
  // re-run, so draining just this runner would serve c2 its pre-batch value.
  // Computeds are pure by contract, so early evaluation is unobservable;
  // effects stay queued for the batch's own flush.
  const fresh = () => {
    if (batching !== null) flushComputeds(batching);
  };

  return {
    get value(): T {
      fresh();

      return out.value;
    },
    peek: () => {
      fresh();

      return out.peek();
    },
    dispose,
  };
}

export function batch<T>(fn: () => T): T {
  if (batching !== null) return fn();
  batching = new Set();
  try {
    return fn();
  } finally {
    drain();
  }
}

export function untrack<T>(fn: () => T): T {
  const previous = active;

  active = null;
  try {
    return fn();
  } finally {
    active = previous;
  }
}
