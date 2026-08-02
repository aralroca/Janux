import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { SVG_ATTRIBUTE_CASES } from './attributes-svg.cases';

describe('svg attribute serialization', () =>
  runCases(SVG_ATTRIBUTE_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
