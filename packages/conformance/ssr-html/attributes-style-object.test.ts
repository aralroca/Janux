import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { STYLE_OBJECT_CASES } from './attributes-style-object.cases';

describe('style object serialization', () =>
  runCases(STYLE_OBJECT_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
