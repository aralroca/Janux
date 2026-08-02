import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import { MATCHER_CASES } from './matchers.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/matchers'), {
  slug: (value) => /^[a-z0-9-]+$/.test(value),
  hex: (value) => /^[0-9a-f]+$/.test(value),
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  // Overrides the built-in: even numbers only.
  integer: (value) => /^\d+$/.test(value) && Number(value) % 2 === 0,
});

describe('custom typed matchers', () =>
  runCases(MATCHER_CASES, (row) => {
    const match = router.match(row.path);

    expect(match?.pattern ?? null).toBe(row.pattern);
    if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
  }));
