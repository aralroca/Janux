type Cleanup = (() => void) | undefined;

interface Runner {
  run: () => void;
  deps: Set<Set<Runner>>;
}

export interface Sig<T> {
  value: T;
  peek(): T;
}

export interface ReadonlySig<T> {
  readonly value: T;
  peek(): T;
  dispose(): void;
}

let active: Runner | null = null;
let batching: Set<Runner> | null = null;

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
  const runner: Runner = { deps: new Set(), run: () => {} };

  runner.run = function runEffect() {
    cleanup?.();
    cleanup = runTracked(runner, fn as () => Cleanup) ?? undefined;
  };
  runner.run();

  return function dispose() {
    cleanup?.();
    detach(runner);
  };
}

export function computed<T>(fn: () => T): ReadonlySig<T> {
  const out = signal<T>(undefined as T);
  const dispose = effect(() => {
    out.value = fn();
  });

  return {
    get value(): T {
      return out.value;
    },
    peek: () => out.peek(),
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
