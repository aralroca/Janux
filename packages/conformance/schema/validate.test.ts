import { describe, expect } from 'bun:test';
import { validate } from 'janux';
import { runCases } from '../support/scenario';
import { VALIDATE_CASES } from './validate.cases';

describe('schema validation', () =>
  runCases(VALIDATE_CASES, (row) => {
    const result = validate(row.type(), row.input);

    expect(result.ok).toBe(row.ok);
    if (row.ok) expect(result.value).toEqual('value' in row ? row.value : row.input);
    if (!row.ok) expect(result.errors[0]?.message ?? '').toContain(row.message ?? '');
    if (row.path !== undefined) expect(result.errors[0]?.path).toBe(row.path);
  }));
