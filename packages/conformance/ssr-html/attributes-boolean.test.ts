import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { BOOLEAN_ATTRIBUTE_CASES } from './attributes-boolean.cases';

describe('boolean attribute serialization', () =>
  runCases(BOOLEAN_ATTRIBUTE_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
