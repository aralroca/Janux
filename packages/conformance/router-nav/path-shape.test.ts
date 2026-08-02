import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import { PATH_SHAPE_CASES } from './path-shape.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/routes'));

describe('path shape', () =>
  runCases(PATH_SHAPE_CASES, (row) => {
    // Whatever the shape, matching must return — never throw, never hang.
    const match = router.match(row.path);

    expect(match?.pattern ?? null).toBe(row.pattern);
    if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
  }));
