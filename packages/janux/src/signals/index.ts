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
    root.cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  };

  owner?.cleanups.push(dispose);

  return runWithOwner(root, () => fn(dispose));
}

export function onCleanup(fn: () => void): void {
  // On an already-disposed scope the cleanup runs immediately — never silently dropped.
  if (owner?.disposed) return fn();
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
  const runners = [...subs];

  if (batching !== null) {
    runners.forEach((runner) => batching!.add(runner));

    return;
  }
  runners.forEach((runner) => runner.run());
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

export function effect(fn: () => Cleanup | void): () => void {
  let cleanup: Cleanup;
  let disposed = false;
  const scope = owner;
  const runner: Runner = { deps: new Set(), run: () => {} };

  // Re-runs restore the creation-time owner and never outlive dispose — a
  // runner already queued in a notify/batch when its island is torn down
  // must not re-subscribe as a zombie.
  runner.run = function runEffect() {
    if (disposed) return;
    cleanup?.();
    // Only a FUNCTION is a cleanup: `watch(() => (title.value = x))` returns a
    // string through the arrow's implicit return, and calling that would throw.
    const result = runWithOwner(scope, () => runTracked(runner, fn as () => Cleanup));

    cleanup = typeof result === 'function' ? result : undefined;
  };
  runner.run();
  const dispose = function dispose() {
    if (disposed) return;
    disposed = true;
    cleanup?.();
    cleanup = undefined;
    detach(runner);
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
    if (batching === null) return;
    let ran = true;

    while (ran) {
      ran = false;
      for (const queued of [...batching]) {
        if (!queued.computed) continue;
        batching.delete(queued);
        queued.run();
        ran = true;
      }
    }
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
    const queued = batching;

    batching = null;
    queued.forEach((runner) => runner.run());
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
