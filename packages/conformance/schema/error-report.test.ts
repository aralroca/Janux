import { describe, expect } from 'bun:test';
import { validate } from 'janux';
import { runCases } from '../support/scenario';
import { ERROR_REPORT_CASES } from './error-report.cases';

describe('error reporting', () =>
  runCases(ERROR_REPORT_CASES, (row) => {
    const result = validate(row.type(), row.input);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(row.errors.map((error) => error.path));
    for (const [i, expected] of row.errors.entries()) {
      expect(result.errors[i]!.message).toContain(expected.message);
    }
  }));
