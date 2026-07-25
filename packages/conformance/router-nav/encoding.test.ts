import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import { ENCODING_CASES } from './encoding.cases';

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/routes'));

describe('path segment encoding', () =>
  runCases(ENCODING_CASES, (row) => {
    // Must never throw, whatever the segment looks like.
    const match = router.match(`/blog/${row.segment}`);

    if (row.slug === null) {
      expect(match?.pattern).not.toBe('/blog/[slug]');

      return;
    }
    expect(match?.pattern).toBe('/blog/[slug]');
    expect(match!.params.slug).toBe(row.slug);
  }));
