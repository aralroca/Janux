import { describe, expect } from 'bun:test';
import { coerceForm, validate } from 'janux';
import { runCases } from '../support/scenario';
import { FORM_PIPELINE_CASES } from './form-pipeline.cases';

describe('form pipeline', () =>
  runCases(FORM_PIPELINE_CASES, (row) => {
    const type = row.type();
    const result = validate(type, coerceForm(row.input, type));

    expect(result.ok).toBe(row.ok);
    if (row.ok) expect(result.value).toEqual('value' in row ? row.value : row.input);
    if (!row.ok) expect(result.errors[0]?.message ?? '').toContain(row.message ?? '');
    if (row.path !== undefined) expect(result.errors[0]?.path).toBe(row.path);
  }));
