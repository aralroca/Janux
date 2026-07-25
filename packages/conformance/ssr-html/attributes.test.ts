import { describe, expect, it } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { ATTRIBUTE_CASES } from './attributes.cases';

describe('attribute serialization', () => {
  it.each(ATTRIBUTE_CASES.map((row) => [row.id, row] as const))('%s', (_id, row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  });
});
