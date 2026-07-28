import { describe, expect, it, mock } from 'bun:test';
import { batch, computed, effect, signal, untrack } from './index';

describe('signals', () => {
  it('reads and writes values', () => {
    const count = signal(0);

    count.value = 2;
    expect(count.value).toBe(2);
    expect(count.peek()).toBe(2);
  });

  it('re-runs effects on change and supports cleanup', () => {
    const count = signal(0);
    const cleanup = mock(() => {});
    const runs = mock(() => {});
    const dispose = effect(() => {
      runs();
      count.value;

      return cleanup;
    });

    count.value = 1;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    dispose();
    count.value = 2;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('does not notify on same value (Object.is)', () => {
    const count = signal(1);
    const runs = mock(() => {});

    effect(() => {
      runs();
      count.value;
    });
    count.value = 1;
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('derives computed values reactively', () => {
    const qty = signal(2);
    const price = signal(100);
    const total = computed(() => qty.value * price.value);

    expect(total.value).toBe(200);
    qty.value = 3;
    expect(total.value).toBe(300);
  });

  it('tracks dynamic dependencies only', () => {
    const flag = signal(true);
    const a = signal('a');
    const b = signal('b');
    const runs = mock(() => {});

    effect(() => {
      runs();
      flag.value ? a.value : b.value;
    });
    b.value = 'B';
    expect(runs).toHaveBeenCalledTimes(1);
    flag.value = false;
    b.value = 'BB';
    expect(runs).toHaveBeenCalledTimes(3);
  });

  it('batches multiple writes into one notification', () => {
    const a = signal(1);
    const b = signal(2);
    const runs = mock(() => {});

    effect(() => {
      runs();
      a.value + b.value;
    });
    batch(() => {
      a.value = 10;
      b.value = 20;
    });
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('a chained computed read mid-batch sees the in-batch writes', () => {
    const a = signal(1);
    const c1 = computed(() => a.value + 1);
    const c2 = computed(() => c1.value * 10);
    let seen = 0;

    batch(() => {
      a.value = 5;
      seen = c2.value;
    });
    expect(seen).toBe(60);
    expect(c2.value).toBe(60);
  });

  it('untrack reads without subscribing', () => {
    const a = signal(1);
    const runs = mock(() => {});

    effect(() => {
      runs();
      untrack(() => a.value);
    });
    a.value = 2;
    expect(runs).toHaveBeenCalledTimes(1);
  });
});

/**
 * Regression: `effect`/`watch` treated ANY return value as a cleanup, so the
 * documented one-liner `watch(() => (document.title = x))` — an arrow with an
 * implicit string return — threw "cleanup is not a function" on the next run
 * and on dispose.
 */
describe('effect cleanup detection', () => {
  it('ignores a non-function return, on re-run and on dispose', () => {
    const count = signal(0);
    // TS rejects a non-void return; JS callers write this by accident all the time
    // (an arrow with an implicit return), which is the case being pinned here.
    const dispose = effect((() => `title ${count.value}`) as unknown as () => void);

    expect(() => (count.value = 1)).not.toThrow();
    expect(() => dispose()).not.toThrow();
  });

  it('still honours a function return as the cleanup', () => {
    const count = signal(0);
    const cleaned: number[] = [];
    const dispose = effect(() => {
      const current = count.value;

      return () => cleaned.push(current);
    });

    count.value = 1;

    expect(cleaned).toEqual([0]);
    dispose();

    expect(cleaned).toEqual([0, 1]);
  });
});
