import { signal } from '../signals';
import { parseDuration } from '../define/factories';
import type { Ctx, SourceDef, SourceReader } from '../define/types';
import type { EventBus } from './bus';
import type { PendingTracker } from './settled';

export interface SourcesRuntime {
  readers: Record<string, SourceReader & { refresh: () => Promise<void> }>;
  start: () => void;
  dispose: () => void;
}

const windowMs = (value: string | number | undefined): number | undefined =>
  value === undefined ? undefined : typeof value === 'string' ? parseDuration(value) : value;

function createOne(
  def: SourceDef,
  ctx: Ctx,
  bus: EventBus,
  tracker: PendingTracker,
  cleanups: (() => void)[],
  initial: { value: unknown } | undefined,
  now: () => number,
) {
  const value = signal<unknown>(initial?.value);
  const pending = signal(initial === undefined);
  const refreshing = signal(initial === undefined);
  const error = signal<unknown>(null);
  const staleTime = windowMs(def.staleTime) ?? 0;
  const swr = windowMs(def.swr);
  let updatedAt = initial === undefined ? -Infinity : now();

  /** Past `staleTime + swr` the value is too old to show — see `swr` on SourceDef. */
  const expired = (): boolean => swr !== undefined && value.value !== undefined && now() - updatedAt >= staleTime + swr;

  const load = async (force = false): Promise<void> => {
    // A policy declined is not a failure: the caller gets a resolved promise and
    // the value it already had.
    if (!force && value.value !== undefined && now() - updatedAt < staleTime) return;
    refreshing.value = true;
    // `pending` means "nothing to show yet", so a refresh over existing data
    // leaves it false: `pending ? spinner : rows` must not blank a table the
    // user is already looking at. `refreshing` is the in-flight signal.
    if (value.value === undefined) pending.value = true;
    await tracker.track(
      Promise.resolve()
        .then(() => def.query({ ctx }))
        .then((result) => {
          value.value = result;
          updatedAt = now();
          error.value = null;
        })
        .catch((cause) => {
          error.value = cause;
        })
        .finally(() => {
          pending.value = false;
          refreshing.value = false;
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
      return expired() ? undefined : value.value;
    },
    get pending() {
      return pending.value || expired();
    },
    get refreshing() {
      return refreshing.value;
    },
    get error() {
      return error.value;
    },
    /** An explicit ask always runs, whatever the freshness policy says. */
    refresh: () => load(true),
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
  now: () => number = Date.now,
): SourcesRuntime {
  const cleanups: (() => void)[] = [];
  const entries = Object.entries(defs ?? {}).map(([name, def]) => {
    return [name, createOne(def, ctx, bus, tracker, cleanups, initialValues?.[name], now)] as const;
  });

  return {
    readers: Object.fromEntries(entries.map(([name, one]) => [name, one.reader])),
    start: () => entries.forEach(([, one]) => one.start()),
    dispose: () => cleanups.forEach((cleanup) => cleanup()),
  };
}
