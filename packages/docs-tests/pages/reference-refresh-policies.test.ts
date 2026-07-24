import { describe, expect, it } from 'bun:test';
import {
  component,
  createBus,
  createInstance,
  effect,
  every,
  jsx,
  onEvent,
  parseDuration,
  schema,
  source,
  str,
} from 'janux';

/** reference/every.md and reference/parse-duration.md, claim by claim. */

describe('reference/parse-duration.md', () => {
  it('converts every documented example', () => {
    expect(parseDuration('300ms')).toBe(300);
    expect(parseDuration('2s')).toBe(2000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('1.5h')).toBe(5_400_000);
    expect(parseDuration('0.5s')).toBe(500);
  });

  it('throws on a missing unit, an unknown unit and a negative value', () => {
    expect(() => parseDuration('5')).toThrow('invalid duration "5" (use e.g. 300ms, 2s, 5m, 1h)');
    expect(() => parseDuration('5min')).toThrow('invalid duration');
    expect(() => parseDuration('-5m')).toThrow('invalid duration');
  });

  it('every() rejects a bad string where it is written', () => {
    expect(() => every('5min')).toThrow('invalid duration');
  });

  it('a bad debounce throws when the component attaches', async () => {
    const Bad = component({
      name: 'bad-debounce',
      state: schema({ n: str().default('') }),
      effects: [effect({ debounce: '5min', run: () => {} })],
      view: () => jsx('p', {}),
    });

    await expect(createInstance(Bad).attach()).rejects.toThrow('invalid duration');
  });
});

describe('reference/every.md', () => {
  it('every(interval) is an interval policy with no events', () => {
    expect(every('30s')).toMatchObject({ everyMs: 30_000, events: [] });
  });

  it('orOn chains repeatedly and never mutates the base', () => {
    const slow = every('10m');
    const a = slow.orOn('a.changed');
    const b = slow.orOn('b.changed');

    expect(a.events).toEqual(['a.changed']);
    expect(b.events).toEqual(['b.changed']);
    expect(slow.events).toEqual([]);
    expect(every('5m').orOn('inventory.changed').orOn('order.placed')).toMatchObject({
      everyMs: 300_000,
      events: ['inventory.changed', 'order.placed'],
    });
  });

  it('onEvent(event) is event-only — no timer', () => {
    expect(onEvent('inventory.changed')).toEqual({ events: ['inventory.changed'] });
    expect((onEvent('x') as { everyMs?: number }).everyMs).toBeUndefined();
  });

  it('the policy really refreshes the source when the event fires on the bus', async () => {
    let queries = 0;
    const Stock = component({
      name: 'stock',
      state: schema({ label: str().default('') }),
      sources: {
        levels: source({
          description: 'Live stock levels',
          query: () => ++queries,
          refresh: every('10m').orOn('inventory.changed'),
        }),
      },
      view: () => jsx('p', {}),
    });
    const bus = createBus();
    const instance = createInstance(Stock, { bus });

    await instance.attach();
    await instance.settled();

    expect(queries).toBe(1);

    bus.emit('inventory.changed', {});
    await instance.settled();

    expect(queries).toBe(2);
  });
});
