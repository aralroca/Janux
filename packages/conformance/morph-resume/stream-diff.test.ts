import { beforeEach, describe, expect } from 'bun:test';
import diff from 'diff-dom-streaming';
import { resetDocument, useDom } from '../support/dom';
import { runCases, runScenarios } from '../support/scenario';
import { chunkedStream, STREAM_DIFF_CASES, STREAM_DIFF_SCENARIOS } from './stream-diff.cases';

useDom();

describe('stream diff: chunked whole-document patches', () => {
  beforeEach(resetDocument);
  runCases(STREAM_DIFF_CASES, async (row) => {
    document.body.innerHTML = row.before;
    await diff(document, chunkedStream(row.chunks));

    expect(document.body.innerHTML).toBe(row.expected);
  });
});

describe('stream diff: identity, callbacks and out-of-body targets', () => {
  beforeEach(resetDocument);
  runScenarios(STREAM_DIFF_SCENARIOS);
});
