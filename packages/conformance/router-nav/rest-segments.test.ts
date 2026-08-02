import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import { REST_CASES, REST_MALFORMED_CASES } from './rest-segments.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/rest'));

describe('rest segments', () =>
  runCases(REST_CASES, (row) => {
    const match = router.match(row.path);

    expect(match?.pattern ?? null).toBe(row.pattern);
    if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
  }));

describe('malformed escapes through the rest decode path', () =>
  runCases(REST_MALFORMED_CASES, (row) => {
    // Must be a clean miss — the malformed tail segment refuses to decode.
    expect(router.match(`/solo/ok/${row.segment}`)).toBeUndefined();
  }));
