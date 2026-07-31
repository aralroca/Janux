import { describe, expect, it } from 'bun:test';
import { source } from '../define/factories';
import { createBus } from './bus';
import { createPendingTracker } from './settled';
import { createSources } from './sources';

/**
 * The third face of one cache model: a route tells a CDN `sharedMaxAge`/`swr`,
 * a query tells the browser `staleTime`/`swr`, and a source says the same two
 * words about the data an island holds. Same three states, same arithmetic.
 */
function wire(def: ReturnType<typeof source>, now: () => number) {
  const bus = createBus();
  const runtime = createSources({ catalog: def }, {}, bus, createPendingTracker(), undefined, now);

  return { bus, runtime, reader: runtime.readers.catalog! };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('source staleTime + swr', () => {
  it('skips a refresh trigger while the value is still fresh', async () => {
    let clock = 0;
    let calls = 0;
    const { bus, runtime, reader } = wire(
      source({ query: () => ++calls, staleTime: '1m', refresh: { events: ['inventory.changed'] } }),
      () => clock,
    );

    runtime.start();
    await settle();
    expect(calls).toBe(1);

    clock = 30_000;
    bus.emit('inventory.changed', undefined);
    bus.emit('inventory.changed', undefined);
    await settle();

    // A burst of events inside the fresh window costs nothing — that is the point.
    expect(calls).toBe(1);
    expect(reader.value).toBe(1);
    runtime.dispose();
  });

  it('revalidates in the background once stale, still showing what it has', async () => {
    let clock = 0;
    let calls = 0;
    const { bus, runtime, reader } = wire(
      source({ query: () => ++calls, staleTime: '1m', swr: '10m', refresh: { events: ['inventory.changed'] } }),
      () => clock,
    );

    runtime.start();
    await settle();
    clock = 120_000;
    bus.emit('inventory.changed', undefined);

    // Stale, not blank: the island keeps rendering the previous rows.
    expect(reader.pending).toBe(false);
    expect(reader.value).toBe(1);
    await settle();
    expect(calls).toBe(2);
    expect(reader.value).toBe(2);
    runtime.dispose();
  });

  it('stops showing a value older than staleTime + swr', async () => {
    let clock = 0;
    const { runtime, reader } = wire(source({ query: async () => 'rows', staleTime: '1m', swr: '10m' }), () => clock);

    runtime.start();
    await settle();
    expect(reader.value).toBe('rows');

    clock = 660_001;
    // Too old to be worth showing: the island falls back to its pending UI.
    expect(reader.value).toBeUndefined();
    expect(reader.pending).toBe(true);
    runtime.dispose();
  });

  it('keeps a value indefinitely when no swr window is declared', async () => {
    let clock = 0;
    const { runtime, reader } = wire(source({ query: async () => 'rows', staleTime: '1m' }), () => clock);

    runtime.start();
    await settle();
    clock = 10_000_000;

    expect(reader.value).toBe('rows');
    expect(reader.pending).toBe(false);
    runtime.dispose();
  });

  it('honours an explicit refresh() even when the value is fresh', async () => {
    let clock = 0;
    let calls = 0;
    const { runtime, reader } = wire(source({ query: () => ++calls, staleTime: '1m' }), () => clock);

    runtime.start();
    await settle();
    clock = 1000;
    await reader.refresh();

    // Asking is not the same as a policy deciding: an explicit refresh always runs.
    expect(calls).toBe(2);
    runtime.dispose();
  });

  it('leaves a source without a policy exactly as it was', async () => {
    let calls = 0;
    const { bus, runtime } = wire(source({ query: () => ++calls, refresh: { events: ['ping'] } }), () => 0);

    runtime.start();
    await settle();
    bus.emit('ping', undefined);
    await settle();

    expect(calls).toBe(2);
    runtime.dispose();
  });
});
