let mutationDepth = 0;

/**
 * Runs `fn` with state mutations enabled (used by intent/effect/event runners).
 * For async bodies the gate stays open until the returned promise settles, so
 * `run()` may mutate after `await`s. The gate is a development guardrail
 * against mutations from views/random code — not an isolation boundary.
 */
export function allowMutations<T>(fn: () => T): T {
  mutationDepth += 1;
  let result: T;

  try {
    result = fn();
  } catch (error) {
    mutationDepth -= 1;
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(() => {
      mutationDepth -= 1;
    }) as T;
  }
  mutationDepth -= 1;

  return result;
}

export function assertMutable(path: string): void {
  if (mutationDepth > 0) return;

  throw new Error(
    `Janux: illegal mutation of "${path}" outside an intent, effect or event handler. ` +
      'State can only change inside declared run() bodies (RFC §4.4).',
  );
}
