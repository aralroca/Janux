import { renderToString } from 'janux';
import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import { EQUIVALENCE_CASES, type EquivalenceRow } from './equivalence.cases';
import { drained } from './harness';

/**
 * Both flavours of the same page, compared against the row and against each
 * other. Chunking is never asserted: the row owns the joined bytes, and the
 * pipeline owns how it cut them.
 */
describe('streaming and buffered renders agree byte for byte', () =>
  runCases(EQUIVALENCE_CASES, async (row: EquivalenceRow) => {
    const streamed = await drained(row.page());
    const { html } = await renderToString(row.page());

    expect(streamed).toBe(row.html);
    expect(html).toBe(row.html);
  }));
