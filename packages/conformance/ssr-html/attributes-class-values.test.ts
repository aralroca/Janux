import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { CLASS_VALUE_CASES } from './attributes-class-values.cases';

describe('class value coercion', () =>
  runCases(CLASS_VALUE_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
