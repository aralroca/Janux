import type { Case } from '../support/case';

/**
 * The form-decoding matrix: every scalar field kind against every class of value
 * a form actually submits.
 *
 * FormData delivers strings (or nothing), so `coerce: 'form'` intents run
 * `coerceForm` before `validate`. Each cell is the end-to-end verdict for one
 * field kind × one submitted value, declared from the contract: numbers parse
 * via `Number` (a blank field stays invalid, it never becomes `0`), checkboxes
 * follow the on/off/absent idiom, and a `str()` field takes any submitted
 * string verbatim.
 *
 * The cells worth the table are the surprising ones: `'0x1f'` and `'1e3'` ARE
 * numbers to `Number`, an absent checkbox is a legitimate `false`, `'NaN'`
 * stays a string while `'Infinity'` parses and is then rejected, and `'19.99'`
 * is money REJECTED — minor units in, minor units out, never scaled.
 */
export interface FormMatrixCase {
  /** Which scalar field kind receives the submission. */
  field: 'str' | 'int' | 'num' | 'money' | 'bool';
  /** Label of the submitted value; the runner maps it to the real string. */
  form: string;
  ok: boolean;
}

export type FormMatrixRow = Case<FormMatrixCase>;

/** Every submitted-value class, once. The runner owns the actual strings. */
export const FORM_LABELS = [
  'text',
  'blank',
  'spaces',
  'numeric',
  'decimal',
  'negative-numeric',
  'plus-prefixed',
  'exponent',
  'hex',
  'infinity-word',
  'nan-word',
  'on',
  'off',
  'true-word',
  'false-word',
  'missing',
] as const;

/**
 * What each field kind ends up accepting, by contract.
 *
 * - `str` takes every submitted string verbatim; only an unsent field fails.
 * - `int`/`money` accept whatever `Number` parses to an integer — including
 *   hex, exponent and `+` notation — and refuse decimals, blanks and words.
 * - `num` adds the decimal case; `'Infinity'` parses but is not finite.
 * - `bool` accepts the four checkbox idiom strings, and an unsent required
 *   checkbox coerces to `false` (unchecked means false, not missing).
 */
export const FORM_ACCEPTS: Record<FormMatrixCase['field'], readonly string[]> = {
  str: [
    'text',
    'blank',
    'spaces',
    'numeric',
    'decimal',
    'negative-numeric',
    'plus-prefixed',
    'exponent',
    'hex',
    'infinity-word',
    'nan-word',
    'on',
    'off',
    'true-word',
    'false-word',
  ],
  int: ['numeric', 'negative-numeric', 'plus-prefixed', 'exponent', 'hex'],
  num: ['numeric', 'decimal', 'negative-numeric', 'plus-prefixed', 'exponent', 'hex'],
  money: ['numeric', 'negative-numeric', 'plus-prefixed', 'exponent', 'hex'],
  bool: ['on', 'off', 'true-word', 'false-word', 'missing'],
};

const FIELDS = Object.keys(FORM_ACCEPTS) as FormMatrixCase['field'][];

export const FORM_MATRIX_CASES: FormMatrixRow[] = FIELDS.flatMap((field) =>
  FORM_LABELS.map((form) => ({
    id: `sch-form-${field}-${form}`,
    src: 'janux',
    field,
    form,
    ok: FORM_ACCEPTS[field].includes(form),
  })),
);
