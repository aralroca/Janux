import { describe, expect } from 'bun:test';
import { cacheHeaders, cachePolicy } from 'janux';
import { runCases, runScenarios } from '../support/scenario';
import { POLICY_ERROR_CASES, POLICY_HEADER_CASES, POLICY_IMMUTABILITY_CASES } from './policy-headers.cases';

describe('cache policy validation', () =>
  runCases(POLICY_ERROR_CASES, (row) => {
    expect(() => cachePolicy(row.def)).toThrow(row.error);
  }));

describe('cache policy headers', () =>
  runCases(POLICY_HEADER_CASES, (row) => {
    expect(cacheHeaders(row.def && cachePolicy(row.def), row.options)).toEqual(row.headers);
  }));

describe('cache policy immutability', () => runScenarios(POLICY_IMMUTABILITY_CASES));
