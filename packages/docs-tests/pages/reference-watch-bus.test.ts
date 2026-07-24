import { describe, expect, it } from 'bun:test';
import { createBus, signal, watch } from 'janux';

/** reference/watch.md and reference/create-bus.md — every guarantee they list. */

describe('reference/watch.md', () => {
  it('runs now and on every change, until dispose', () => {
    const query = signal('');
    const seen: string[] = [];
    const dispose = watch(() => seen.push(query.value));

    expect(seen).toEqual(['']); // ran immediately
    query.value = 'janux';

    expect(seen).toEqual(['', 'janux']);
    dispose();
    query.value = 'ignored';

    expect(seen).toEqual(['', 'janux']);
  });

  it('runs the returned cleanup before each re-run and on dispose', () => {
    const url = signal('/a');
    const log: string[] = [];
    const dispose = watch(() => {
      const current = url.value;

      log.push(`run:${current}`);

      return () => log.push(`clean:${current}`);
    });

    url.value = '/b';

    expect(log).toEqual(['run:/a', 'clean:/a', 'run:/b']);
    dispose();

    expect(log).toEqual(['run:/a', 'clean:/a', 'run:/b', 'clean:/b']);
  });

  it('rebuilds dependencies every run: a branch not taken is not a dependency', () => {
    const useLeft = signal(true);
    const left = signal('L');
    const right = signal('R');
    let runs = 0;
    const dispose = watch(() => {
      runs += 1;
      useLeft.value ? left.value : right.value;
    });

    right.value = 'R2'; // not a dependency yet

    expect(runs).toBe(1);
    useLeft.value = false;

    expect(runs).toBe(2);
    right.value = 'R3'; // now it is

    expect(runs).toBe(3);
    left.value = 'L2'; // and the old one no longer is

    expect(runs).toBe(3);
    dispose();
  });

  it('dispose is idempotent', () => {
    const count = signal(0);
    const dispose = watch(() => count.value);

    dispose();

    expect(() => dispose()).not.toThrow();
  });
});

describe('reference/create-bus.md', () => {
  it('emit is synchronous and runs handlers in registration order', () => {
    const bus = createBus();
    const order: string[] = [];

    bus.on('cart.cleared', () => order.push('first'));
    bus.on('cart.cleared', () => order.push('second'));
    bus.emit('cart.cleared', { at: 1 });

    expect(order).toEqual(['first', 'second']); // already done when emit returned
  });

  it('on() returns an unsubscribe that takes effect immediately', () => {
    const bus = createBus();
    const seen: unknown[] = [];
    const off = bus.on('cart.cleared', (payload) => seen.push(payload));

    bus.emit('cart.cleared', { at: 1 });
    off();
    bus.emit('cart.cleared', { at: 2 });

    expect(seen).toEqual([{ at: 1 }]);
  });

  it('a throwing handler propagates to the emit caller — nothing is swallowed', () => {
    const bus = createBus();

    bus.on('boom', () => {
      throw new Error('handler failed');
    });

    expect(() => bus.emit('boom', {})).toThrow('handler failed');
  });

  it('two buses are separate channels', () => {
    const one = createBus();
    const other = createBus();
    const seen: string[] = [];

    one.on('ping', () => seen.push('one'));
    other.emit('ping', {});

    expect(seen).toEqual([]);
  });
});
