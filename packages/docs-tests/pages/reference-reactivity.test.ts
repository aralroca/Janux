import { describe, expect, it } from 'bun:test';
import { batch, computed, createRoot, onCleanup, signal, untrack, watch } from 'janux';
import { docExample } from '../doc-example';

/**
 * The reactivity reference pages make precise claims (dedupe by Object.is,
 * dynamic dependencies, one flush per batch, reverse-order cleanups). Each is
 * asserted here, and the documented example that teaches it is executed.
 */

describe('reference/signal.md', () => {
  it('runs its documented example: subscribe on read, peek stays silent', async () => {
    const logs: unknown[][] = [];
    const original = console.log;

    // Block body on purpose: an arrow returning push()'s number would be
    // handed to watch() as a cleanup, which is not what the example does.
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      await docExample('apps/docs/content/reference/signal.md', 1);
    } finally {
      console.log = original;
    }

    expect(logs).toEqual([
      ['count is', 0],
      ['count is', 1],
    ]);
  });

  it('deduplicates writes with Object.is', () => {
    const name = signal('ada');
    let runs = 0;

    watch(() => {
      name.value;
      runs += 1;
    });
    name.value = 'ada';

    expect(runs).toBe(1);
    name.value = 'grace';

    expect(runs).toBe(2);
  });
});

describe('reference/computed.md', () => {
  it('runs its documented example and tracks dependencies dynamically', async () => {
    await docExample('apps/docs/content/reference/computed.md', 1);

    const useMetric = signal(true);
    const metric = signal(10);
    const imperial = signal(4);
    let runs = 0;
    const shown = computed(() => {
      runs += 1;

      return useMetric.value ? metric.value : imperial.value;
    });

    expect(shown.value).toBe(10);
    imperial.value = 5;

    expect(runs).toBe(1); // the branch not taken is not a dependency
  });
});

describe('reference/batch.md', () => {
  it('flushes once per outermost batch, and inner batches join it', async () => {
    await docExample('apps/docs/content/reference/batch.md', 1);

    const price = signal(250);
    const qty = signal(2);
    let runs = 0;

    watch(() => {
      price.value;
      qty.value;
      runs += 1;
    });
    batch(() => {
      batch(() => (price.value = 300));
      qty.value = 4;

      expect(price.value).toBe(300); // reads see writes immediately
    });

    expect(runs).toBe(2);
  });
});

describe('reference/untrack.md', () => {
  it('reads without subscribing', async () => {
    await docExample('apps/docs/content/reference/untrack.md', 1);

    const tracked = signal(0);
    const ignored = signal(0);
    let runs = 0;

    watch(() => {
      tracked.value;
      untrack(() => ignored.value);
      runs += 1;
    });
    ignored.value = 1;

    expect(runs).toBe(1);
    tracked.value = 1;

    expect(runs).toBe(2);
  });
});

describe('reference/owners.md', () => {
  it('disposes effects with their scope and unwinds cleanups in reverse', () => {
    const count = signal(0);
    const order: string[] = [];
    let runs = 0;
    const stop = createRoot((dispose) => {
      watch(() => {
        count.value;
        runs += 1;
      });
      onCleanup(() => order.push('first'));
      onCleanup(() => order.push('second'));

      return dispose;
    });

    count.value = 1;

    expect(runs).toBe(2);
    stop();
    stop(); // idempotent

    expect(order).toEqual(['second', 'first']);
    count.value = 2;

    expect(runs).toBe(2); // the effect went with the scope
  });

  it('runs onCleanup immediately on an already-disposed scope', () => {
    let ran = false;

    createRoot((dispose) => {
      dispose();
      onCleanup(() => (ran = true));
    });

    expect(ran).toBe(true);
  });
});
