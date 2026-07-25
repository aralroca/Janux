import { createFsRouter } from '@janux/server';
import { describe, expect, it } from 'bun:test';
import { dirname, join } from 'node:path';
import { MATCH_CASES } from './match.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/routes'));

describe('route matching', () => {
  it.each(MATCH_CASES.map((row) => [row.id, row] as const))('%s', (_id, row) => {
    const match = router.match(row.path);

    expect(match?.pattern ?? null).toBe(row.pattern);
    if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
  });
});
