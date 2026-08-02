import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import {
  CHAR_CASES,
  PAIR_CASES,
  PARAM_KEYS_CASES,
  TAIL_CASES,
  TRAVERSAL_CASES,
  TYPED_CASES,
  UNICODE_CASES,
  type FullPathRow,
} from './params-decoding.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/decoding'));

const checkFullPath = (row: FullPathRow) => {
  const match = router.match(row.path);

  expect(match?.pattern ?? null).toBe(row.pattern);
  if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
};

describe('two params in one path', () =>
  runCases(PAIR_CASES, (row) => {
    const match = router.match(`/pair/${row.first}/${row.second}`);

    if (row.params === null) {
      expect(match?.pattern).not.toBe('/pair/[a]/[b]');

      return;
    }
    expect(match?.pattern).toBe('/pair/[a]/[b]');
    expect(match!.params).toEqual(row.params);
  }));

describe('typed params decode before matching', () =>
  runCases(TYPED_CASES, (row) => {
    const match = router.match(`${row.route.slice(0, row.route.indexOf('['))}${row.segment}`);

    if (row.value === null) {
      expect(match?.pattern ?? null).toBe(null);

      return;
    }
    expect(match?.pattern).toBe(row.route);
    expect(Object.values(match!.params)).toEqual([row.value]);
  }));

describe('character taxonomy in a param', () =>
  runCases([...CHAR_CASES, ...UNICODE_CASES], (row) => {
    const match = router.match(`/one/${row.segment}`);

    expect(match?.pattern).toBe('/one/[p]');
    expect(match!.params.p).toBe(row.p);
  }));

describe('traversal spellings stay params', () => runCases(TRAVERSAL_CASES, checkFullPath));

describe('param before a static tail', () => runCases(TAIL_CASES, checkFullPath));

describe('hostile param names', () =>
  runCases(PARAM_KEYS_CASES, (row) => {
    const match = router.match(row.path);

    expect(match?.pattern).toBe(row.pattern);
    // `Object.entries` so an expectation literal cannot fall into the same
    // `__proto__` trap the case is guarding against.
    expect(Object.entries(match!.params)).toEqual(row.entries);
  }));
