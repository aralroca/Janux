import { describe, expect, it } from 'bun:test';
import { renderToString } from 'janux';
import { ELEMENT_CASES } from './elements.cases';

describe('element serialization', () => {
  it.each(ELEMENT_CASES.map((row) => [row.id, row] as const))('%s', async (_id, row) => {
    const { html } = await renderToString(row.node());

    expect(html).toBe(row.expected);
  });
});
