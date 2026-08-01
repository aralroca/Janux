import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { NAME_VALUE_CASES } from './attributes-names-values.cases';

describe('attribute name and value coercion', () =>
  runCases(NAME_VALUE_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
