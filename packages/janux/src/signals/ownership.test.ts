import { describe, expect, it } from 'bun:test';
import { createRoot, effect, onCleanup, signal } from './index';

describe('ownership tree', () => {
  it('createRoot disposes effects created inside it', () => {
    const count = signal(0);
    const seen: number[] = [];
    let stop!: () => void;

    createRoot((dispose) => {
      stop = dispose;
      effect(() => {
        seen.push(count.value);
      });
    });
    count.value = 1;
    stop();
    count.value = 2;
    expect(seen).toEqual([0, 1]);
  });

  it('runs onCleanup callbacks in reverse order on dispose', () => {
    const order: string[] = [];

    createRoot((dispose) => {
      onCleanup(() => order.push('first'));
      onCleanup(() => order.push('second'));
      dispose();
    });
    expect(order).toEqual(['second', 'first']);
  });

  it('nested roots dispose with their parent', () => {
    const inner: string[] = [];

    createRoot((dispose) => {
      createRoot(() => {
        onCleanup(() => inner.push('child'));
      });
      dispose();
    });
    expect(inner).toEqual(['child']);
  });

  it('an effect disposed mid-notification never re-runs nor re-subscribes (no zombies)', () => {
    const count = signal(0);
    const seen: number[] = [];
    let disposeChild!: () => void;

    effect(() => {
      if (count.value === 1) disposeChild();
    });
    disposeChild = effect(() => {
      seen.push(count.value);
    });
    count.value = 1;
    expect(seen).toEqual([0]);
    count.value = 2;
    expect(seen).toEqual([0]);
  });

  it('effect re-runs restore the creation-time owner for onCleanup', () => {
    const count = signal(0);
    const cleanups: number[] = [];
    let stop!: () => void;

    createRoot((dispose) => {
      stop = dispose;
      effect(() => {
        const value = count.value;

        onCleanup(() => cleanups.push(value));
      });
    });
    count.value = 1;
    stop();
    expect(cleanups).toEqual([1, 0]);
  });

  it('onCleanup on a disposed scope runs immediately', () => {
    let ran = false;

    createRoot((dispose) => {
      dispose();
      onCleanup(() => (ran = true));
    });
    expect(ran).toBe(true);
  });

  it('dispose is idempotent', () => {
    let runs = 0;

    createRoot((dispose) => {
      onCleanup(() => (runs += 1));
      dispose();
      dispose();
    });
    expect(runs).toBe(1);
  });
});
