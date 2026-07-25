import { describe, expect, it } from 'bun:test';
import { renderToString } from 'janux';
import { RAW_SINK_CASES } from './raw-sinks.cases';

describe('raw sinks', () => {
  it.each(RAW_SINK_CASES.map((row) => [row.id, row] as const))('%s', async (_id, row) => {
    const { html } = await renderToString(row.node());

    expect(html).toBe(row.expected);
  });
});
