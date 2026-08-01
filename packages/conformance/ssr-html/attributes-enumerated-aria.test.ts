import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { ENUMERATED_ARIA_CASES } from './attributes-enumerated-aria.cases';

describe('enumerated and aria attribute serialization', () =>
  runCases(ENUMERATED_ARIA_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
