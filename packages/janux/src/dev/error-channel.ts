import type { GuardValue, Origin } from '../define/types';

/**
 * The dev-only channel that carries *why* an error happened, not just where.
 *
 * A stack trace answers "which line threw". Janux knows the rest of the
 * sentence — which island, which declared behavior, under which guard, and on
 * whose behalf — because every invocation goes through one pipeline (design
 * invariant 4). This is where that pipeline hands it to the overlay.
 *
 * Every publisher is wrapped in `import.meta.env?.DEV`, so this module is
 * unreachable from a production build and Rollup drops it whole. It keeps no
 * module-level side effects for exactly that reason.
 */

export type JanuxErrorKind = 'intent' | 'effect' | 'source';

export interface JanuxErrorChain {
  kind: JanuxErrorKind;
  /** The component (or store) that declared the failing behavior. */
  component: string;
  /** Declared name of the intent, effect or source — behavior is named (invariant 3). */
  name: string;
  /** `ui://cart#default`: the island instance, when the failure came from a mounted one. */
  island?: string;
  /** Who the invocation was on behalf of. Only an intent has a caller. */
  origin?: Origin;
  /** What the guard decided for that caller, as the pipeline resolved it. */
  guard?: GuardValue;
  input?: unknown;
}

export type JanuxErrorListener = (error: unknown, chain: JanuxErrorChain) => void;

const listeners = new Set<JanuxErrorListener>();

/** Subscribes to failures the runtime can explain. Returns the unsubscribe. */
export function onJanuxError(listener: JanuxErrorListener): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/**
 * Announces a failure. The caller rethrows the original error immediately
 * after, so a broken listener must never become the error the app sees — it is
 * reported and the rest still run.
 */
export function publishJanuxError(error: unknown, chain: JanuxErrorChain): void {
  listeners.forEach((listener) => {
    try {
      listener(error, chain);
    } catch (failure) {
      console.error('[janux dev] error overlay listener failed', failure);
    }
  });
}
