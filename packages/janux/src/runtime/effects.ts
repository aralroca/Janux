import { computed, effect as watch, untrack } from '../signals';
import { withGate, type MutationGate } from '../state/mutation-gate';
import { parseDuration } from '../define/factories';
import type { Cleanup, EffectDef, RunBag } from '../define/types';
import type { PendingTracker } from './settled';

interface EffectRuntime {
  dispose: () => void;
}

function runEffectBody(def: EffectDef, bag: RunBag, tracker: PendingTracker, gate: MutationGate): Cleanup {
  const result = withGate(gate, () => def.run(bag));

  if (result instanceof Promise) {
    tracker.track(result);

    return undefined;
  }

  return typeof result === 'function' ? result : undefined;
}

function startOne(def: EffectDef, bag: RunBag, tracker: PendingTracker, gate: MutationGate): EffectRuntime {
  const debounceMs = def.debounce ? parseDuration(def.debounce) : 0;
  let cleanup: Cleanup;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let releaseTimer: (() => void) | undefined;
  let disposers: (() => void)[] = [];

  const runNow = (): void => {
    cleanup?.();
    cleanup = untrack(() => runEffectBody(def, bag, tracker, gate));
  };

  const schedule = (): void => {
    if (debounceMs === 0) return runNow();
    clearTimeout(timer);
    releaseTimer?.();
    releaseTimer = tracker.add();
    timer = setTimeout(() => {
      releaseTimer?.();
      releaseTimer = undefined;
      runNow();
    }, debounceMs);
  };

  if (def.when) {
    const watched = computed(() => def.when!(bag.state));
    let first = true;
    const stop = watch(() => {
      watched.value;
      untrack(() => (first ? runNow() : schedule()));
      first = false;
    });

    disposers = [stop, watched.dispose];
  } else {
    runNow();
  }

  return {
    dispose() {
      clearTimeout(timer);
      releaseTimer?.();
      disposers.forEach((dispose) => dispose());
      cleanup?.();
    },
  };
}

/** Starts all declared effects; each runs on attach and on `when` changes (debounced). */
export function startEffects(
  defs: Record<string, EffectDef> | undefined,
  bag: RunBag,
  tracker: PendingTracker,
  gate: MutationGate,
): () => void {
  const running = Object.values(defs ?? {}).map((def) => startOne(def, bag, tracker, gate));

  return () => running.forEach((runtime) => runtime.dispose());
}
