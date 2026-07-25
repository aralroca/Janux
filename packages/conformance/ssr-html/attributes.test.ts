import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { ATTRIBUTE_CASES } from './attributes.cases';

describe('attribute serialization', () =>
  runCases(ATTRIBUTE_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
