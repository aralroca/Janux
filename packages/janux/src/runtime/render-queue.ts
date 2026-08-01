/**
 * Renders queued to the end of the current task.
 *
 * Every intent flushes its own batch synchronously, so a burst that lands in
 * one task — a paste firing 128 `input` handlers, an agent replaying a script,
 * a store fan-out — used to cost one full island render *per event*, however
 * little each one changed. Queuing collapses the burst into a single render
 * and still runs it inside the same task, so nothing paints a stale frame.
 *
 * `flushRenders()` is the observation point: the intent pipeline runs it before
 * resolving, so `await intent()` sees the DOM the intent produced.
 */
const pending = new Set<() => void>();
let scheduled = false;

export function scheduleRender(run: () => void): void {
  pending.add(run);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(flushRenders);
}

/** Drains to a fixed point: a render whose view writes state re-queues here. */
export function flushRenders(): void {
  scheduled = false;
  while (pending.size > 0) {
    const next = pending.values().next().value as () => void;

    pending.delete(next);
    next();
  }
}
