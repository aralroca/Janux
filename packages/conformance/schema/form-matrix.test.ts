import { describe, expect } from 'bun:test';
import { bool, coerceForm, int, money, num, str, validate, type JxType } from 'janux';
import { runCases } from '../support/scenario';
import { FORM_MATRIX_CASES, type FormMatrixRow } from './form-matrix.cases';

/** One submitted value per label. `missing` is a field the form never sent. */
const SUBMISSIONS: Record<string, unknown> = {
  text: 'hello',
  blank: '',
  spaces: '   ',
  numeric: '42',
  decimal: '19.99',
  'negative-numeric': '-7',
  'plus-prefixed': '+5',
  exponent: '1e3',
  hex: '0x1f',
  'infinity-word': 'Infinity',
  'nan-word': 'NaN',
  on: 'on',
  off: 'off',
  'true-word': 'true',
  'false-word': 'false',
  missing: undefined,
};

const FIELDS: Record<FormMatrixRow['field'], () => JxType> = { str, int, num, money, bool };

describe('form decoding matrix', () =>
  runCases(FORM_MATRIX_CASES, (row) => {
    const type = FIELDS[row.field]();

    expect(validate(type, coerceForm(SUBMISSIONS[row.form], type)).ok).toBe(row.ok);
  }));
