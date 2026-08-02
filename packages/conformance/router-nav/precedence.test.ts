import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import { ORDER_CASES, PRECEDENCE_CASES } from './precedence.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/precedence'));

describe('route precedence', () =>
  runCases(PRECEDENCE_CASES, (row) => {
    const match = router.match(row.path);

    expect(match?.pattern ?? null).toBe(row.pattern);
    if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
  }));

const order = router.routes.map((route) => route.pattern);

describe('route order', () =>
  runCases(ORDER_CASES, (row) => {
    // Both patterns must exist — an absent route would "win" any ordering check.
    expect(order).toContain(row.before);
    expect(order).toContain(row.after);
    expect(order.indexOf(row.before)).toBeLessThan(order.indexOf(row.after));
  }));
