import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join, relative } from 'node:path';
import { runCases } from '../support/scenario';
import { CONVENTION_CASES, ERROR_PAGE_CASES, LAYOUT_CASES } from './conventions.cases';

const root = join(dirname(import.meta.path), '__fixtures__/conventions');
const router = createFsRouter(root);
const routers = { conventions: router, routes: createFsRouter(join(dirname(import.meta.path), '__fixtures__/routes')) };

describe('file conventions', () =>
  runCases(CONVENTION_CASES, (row) => {
    const match = router.match(row.path);

    expect(match?.pattern ?? null).toBe(row.pattern);
    expect(match ? relative(root, match.filePath) : null).toBe(row.file);
  }));

describe('layout chains', () =>
  runCases(LAYOUT_CASES, (row) => {
    const match = router.match(row.path);

    expect(match).toBeDefined();
    expect(match!.layouts.map((layout) => relative(root, layout))).toEqual(row.layouts);
  }));

describe('error page discovery', () =>
  runCases(ERROR_PAGE_CASES, (row) => {
    const page = routers[row.fixture].errorPages[row.kind];

    expect(page ? relative(join(dirname(import.meta.path), '__fixtures__', row.fixture), page) : null).toBe(row.file);
  }));
