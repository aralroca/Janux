import { afterEach, describe, expect, it } from 'bun:test';
import { worker } from './index';

/**
 * These run the real thing: Bun implements blob-URL module workers, so every
 * case below actually crosses a thread boundary instead of talking to a mock.
 */

const RealWorker = globalThis.Worker;

afterEach(() => {
  globalThis.Worker = RealWorker;
});

describe('worker()', () => {
  it('resolves with the value the function returned off the main thread', async () => {
    const add = worker((a: number, b: number) => a + b);

    expect(await add(2, 3)).toBe(5);
    add.terminate();
  });

  it('awaits an async worker function', async () => {
    const slow = worker(async (value: number) => {
      await new Promise((resolve) => setTimeout(resolve, 1));

      return value * 2;
    });

    expect(await slow(21)).toBe(42);
    slow.terminate();
  });

  it('rejects with the error the worker function threw', async () => {
    const boom = worker((value: number) => {
      if (value < 0) throw new Error('negative input');

      return value;
    });

    await expect(boom(-1)).rejects.toThrow('negative input');
    boom.terminate();
  });

  it('keeps concurrent calls correlated to their own results', async () => {
    const echo = worker((value: number) => value);
    const results = await Promise.all([echo(1), echo(2), echo(3), echo(4)]);

    expect(results).toEqual([1, 2, 3, 4]);
    echo.terminate();
  });

  it('spawns lazily and reuses one worker across calls', async () => {
    let constructed = 0;

    globalThis.Worker = class extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        constructed += 1;
      }
    } as unknown as typeof Worker;

    const double = worker((value: number) => value * 2);

    expect(constructed).toBe(0);
    expect(await double(1)).toBe(2);
    expect(await double(2)).toBe(4);
    expect(constructed).toBe(1);
    double.terminate();
  });

  it('runs the function inline when the runtime has no Web Workers (SSR)', async () => {
    // @ts-expect-error — deleting the global is the whole point of the case.
    delete globalThis.Worker;
    const add = worker((a: number, b: number) => a + b);

    expect(await add(20, 22)).toBe(42);
  });

  it('fails loudly when the function captures something it cannot carry', async () => {
    // A helper the worker cannot see — unlike a literal constant, no bundler
    // can inline this away, so the boundary is what the test actually proves.
    const scale = (value: number) => value * 3;
    const scaled = worker((value: number) => scale(value));

    await expect(scaled(2)).rejects.toThrow(/scale/);
    scaled.terminate();
  });

  it('rejects an argument structured clone refuses, and stays usable after', async () => {
    const echo = worker((value: unknown) => value);

    await expect(echo(() => 'not cloneable')).rejects.toThrow();
    // The failed call must not have left its slot waiting: the next one works.
    expect(await echo('fine')).toBe('fine');
    echo.terminate();
  });

  it('spawns a fresh worker after terminate()', async () => {
    const echo = worker((value: string) => value);

    expect(await echo('before')).toBe('before');
    echo.terminate();
    expect(await echo('after')).toBe('after');
    echo.terminate();
  });
});
