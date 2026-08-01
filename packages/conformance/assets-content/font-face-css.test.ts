import { describe, expect } from 'bun:test';
import { fontFaceCss } from '../../janux/src/font/css';
import { runCases } from '../support/scenario';
import { FONT_CSS_CASES } from './font-face-css.cases';

describe('@font-face stylesheet', () =>
  runCases(FONT_CSS_CASES, (row) => {
    expect(fontFaceCss(row.fonts)).toBe(row.expected);
  }));
