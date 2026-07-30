import { describe, expect, it } from 'bun:test';
import { worker } from 'janux/worker';
import { docExample } from '../doc-example';

/**
 * reference/worker.md documents a boundary, not just a signature. Every claim
 * on that page is executed here against a real worker thread — Bun implements
 * blob-URL module workers, so none of this is simulated.
 */

describe('reference/worker.md', () => {
  it('the documented prime counter runs on a thread and returns π(n)', async () => {
    const { countPrimes } = await docExample('apps/docs/content/reference/worker.md', 2);

    expect(await countPrimes(1_000_000)).toBe(78498);
    countPrimes.terminate();
  });

  it('a captured variable rejects instead of silently reading undefined', async () => {
    const scale = (n: number) => n * 3;
    const broken = worker((n: number) => scale(n));

    await expect(broken(2)).rejects.toThrow(/scale/);
    broken.terminate();
  });

  it('everything arriving as an argument works, exactly as the page says', async () => {
    const works = worker((n: number, factor: number) => n * factor);

    expect(await works(7, 6)).toBe(42);
    works.terminate();
  });

  it('concurrent calls resolve to their own results', async () => {
    const echo = worker((value: number) => value);

    expect(await Promise.all([echo(1), echo(2), echo(3)])).toEqual([1, 2, 3]);
    echo.terminate();
  });

  it('terminate() lets a later call spawn a fresh thread', async () => {
    const echo = worker((value: string) => value);

    expect(await echo('before')).toBe('before');
    echo.terminate();
    expect(await echo('after')).toBe('after');
    echo.terminate();
  });
});
