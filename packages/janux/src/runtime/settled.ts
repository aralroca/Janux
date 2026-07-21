import { effect, signal } from '../signals';

export interface PendingTracker {
  track<T>(work: Promise<T>): Promise<T>;
  add(): () => void;
  readonly count: number;
  settled(): Promise<void>;
}

/**
 * Counts in-flight async work (sources loading, effects running, debounce
 * timers). `settled()` resolves when the count reaches zero — the primitive
 * behind `ui.settled()` (RFC §5.4).
 */
export function createPendingTracker(): PendingTracker {
  const count = signal(0);

  const add = (): (() => void) => {
    count.value = count.peek() + 1;
    let done = false;

    return () => {
      if (done) return;
      done = true;
      count.value = count.peek() - 1;
    };
  };

  const track = <T>(work: Promise<T>): Promise<T> => {
    const done = add();

    return work.finally(done);
  };

  const settled = (): Promise<void> => {
    return new Promise((resolve) => {
      const dispose = effect(() => {
        if (count.value > 0) return;
        queueMicrotask(() => {
          if (count.peek() > 0) return;
          dispose();
          resolve();
        });
      });
    });
  };

  return {
    track,
    add,
    settled,
    get count() {
      return count.peek();
    },
  };
}
