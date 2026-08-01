import { describe, expect } from 'bun:test';
import { fallbackOverrides } from '../../janux/src/font/css';
import { runCases } from '../support/scenario';
import { FONT_METRICS_CASES } from './font-metrics.cases';

describe('fallback metric overrides', () =>
  runCases(FONT_METRICS_CASES, (row) => {
    expect(fallbackOverrides(row.font, row.fallback)).toEqual(row.expected);
  }));
