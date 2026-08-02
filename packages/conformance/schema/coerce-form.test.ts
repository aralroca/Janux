import { describe, expect } from 'bun:test';
import { coerceForm } from 'janux';
import { runCases } from '../support/scenario';
import { COERCE_FORM_CASES } from './coerce-form.cases';

describe('form coercion', () =>
  runCases(COERCE_FORM_CASES, (row) => {
    expect(coerceForm(row.input, row.type())).toEqual(row.coerced);
  }));
