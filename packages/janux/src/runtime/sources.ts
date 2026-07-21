import { signal } from '../signals';
import type { Ctx, SourceDef, SourceReader } from '../define/types';
import type { EventBus } from './bus';
import type { PendingTracker } from './settled';

export interface SourcesRuntime {
  readers: Record<string, SourceReader & { refresh: () => Promise<void> }>;
  start: () => void;
  dispose: () => void;
}

function createOne(
  def: SourceDef,
  ctx: Ctx,
  bus: EventBus,
  tracker: PendingTracker,
  cleanups: (() => void)[],
  initial: { value: unknown } | undefined,
) {
  const value = signal<unknown>(initial?.value);
  const pending = signal(initial === undefined);
  const error = signal<unknown>(null);

  const load = async (): Promise<void> => {
    pending.value = true;
    await tracker.track(
      Promise.resolve()
        .then(() => def.query({ ctx }))
        .then((result) => {
          value.value = result;
          error.value = null;
        })
        .catch((cause) => {
          error.value = cause;
        })
        .finally(() => {
          pending.value = false;
        }),
    );
  };

  const start = (): void => {
    if (initial === undefined) load().catch(() => {});
    if (def.refresh?.everyMs) {
      const interval = setInterval(() => load().catch(() => {}), def.refresh.everyMs);

      cleanups.push(() => clearInterval(interval));
    }
    def.refresh?.events.forEach((event) => {
      cleanups.push(bus.on(event, () => load().catch(() => {})));
    });
  };

  const reader = {
    get value() {
      return value.value;
    },
    get pending() {
      return pending.value;
    },
    get error() {
      return error.value;
    },
    refresh: load,
  };

  return { reader, start };
}

/**
 * Wires declared sources: async load with pending/error, timers and event
 * refresh. `initialValues` (from the SSR snapshot) skip the first load —
 * resumed islands never double-fetch what the server already loaded.
 */
export function createSources(
  defs: Record<string, SourceDef> | undefined,
  ctx: Ctx,
  bus: EventBus,
  tracker: PendingTracker,
  initialValues?: Record<string, { value: unknown }>,
): SourcesRuntime {
  const cleanups: (() => void)[] = [];
  const entries = Object.entries(defs ?? {}).map(([name, def]) => {
    return [name, createOne(def, ctx, bus, tracker, cleanups, initialValues?.[name])] as const;
  });

  return {
    readers: Object.fromEntries(entries.map(([name, one]) => [name, one.reader])),
    start: () => entries.forEach(([, one]) => one.start()),
    dispose: () => cleanups.forEach((cleanup) => cleanup()),
  };
}
