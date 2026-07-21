export interface MutationGate {
  depth: number;
}

export function createGate(): MutationGate {
  return { depth: 0 };
}

/**
 * Runs `fn` with mutations enabled on ONE instance's gate. For async bodies
 * the gate stays open until the promise settles, so `run()` may mutate after
 * `await`s. Per-instance scoping means an in-flight async intent never opens
 * the door for other components' state. A development guardrail, not an
 * isolation boundary.
 */
export function withGate<T>(gate: MutationGate, fn: () => T): T {
  gate.depth += 1;
  let result: T;

  try {
    result = fn();
  } catch (error) {
    gate.depth -= 1;
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(() => {
      gate.depth -= 1;
    }) as T;
  }
  gate.depth -= 1;

  return result;
}

export function assertMutable(gate: MutationGate, path: string): void {
  if (gate.depth > 0) return;

  throw new Error(
    `Janux: illegal mutation of "${path}" outside an intent, effect or event handler. ` +
      'State can only change inside declared run() bodies (RFC §4.4).',
  );
}
