let mutationDepth = 0;

/** Runs `fn` with state mutations enabled (used by intent/effect/event runners). */
export function allowMutations<T>(fn: () => T): T {
  mutationDepth += 1;
  try {
    return fn();
  } finally {
    mutationDepth -= 1;
  }
}

export function assertMutable(path: string): void {
  if (mutationDepth > 0) return;

  throw new Error(
    `Janux: illegal mutation of "${path}" outside an intent, effect or event handler. ` +
      'State can only change inside declared run() bodies (RFC §4.4).',
  );
}
