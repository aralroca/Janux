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
