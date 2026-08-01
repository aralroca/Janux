import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  MATCH_CASES,
  OUTCOMES,
  REF_CASES,
  REF_ERROR_CASES,
  deepSubset,
  resolveRefs,
} from './eval-matching.cases';

describe('references between eval steps', () =>
  runCases(REF_CASES, (row) => {
    expect(resolveRefs(row.value, OUTCOMES)).toEqual(row.resolved);
  }));

describe('a reference that resolves to nothing', () =>
  runCases(REF_ERROR_CASES, (row) => {
    // Loudly, not as `undefined`: the next step would otherwise call the tool
    // with a field missing and fail for a reason that is not the one.
    expect(() => resolveRefs(row.value, OUTCOMES)).toThrow(row.says);
  }));

describe('matching an eval expectation against what the app answered', () =>
  runCases(MATCH_CASES, (row) => {
    expect(deepSubset(row.expected, row.actual)).toBe(row.matches);
  }));
