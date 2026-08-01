import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import { ORDER_CASES, type OrderRow } from './ordering.cases';

/**
 * Presence first, then order: a missing marker reports itself by name instead of
 * failing as an out-of-order index, which is the difference between "the runtime
 * moved" and "the runtime is gone".
 */
describe('what the stream guarantees about order', () =>
  runCases(ORDER_CASES, async (row: OrderRow) => {
    const html = await row.stream();
    const at = row.order.map((marker) => html.indexOf(marker));

    expect(row.order.filter((_, index) => at[index]! < 0)).toEqual([]);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
  }));
