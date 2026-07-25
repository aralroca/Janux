import type { Case } from '../support/case';

/**
 * The type-conformance table: every builder against every class of input.
 *
 * This is the shape of JSON-Schema's own test suite — instance × type, one declared
 * verdict per cell. The acceptance sets below are written from the *contract*
 * (what each Janux type means), not derived from the implementation, so a change in
 * `PRIMITIVE_CHECKS` that widens or narrows a type shows up as a diff here rather
 * than passing silently.
 *
 * The rows worth the table are the ones that look acceptable and are not: a numeric
 * string against `int()`, `NaN` against `num()`, an array of one against a scalar,
 * a boxed primitive, `-0`, and a float whose fraction happens to be zero.
 */
export interface TypeMatrixCase {
  /** Which builder is under test. */
  type: 'str' | 'int' | 'num' | 'bool' | 'money' | 'enum' | 'list' | 'obj';
  /** Label of the input class; the runner maps it to a value. */
  input: string;
  ok: boolean;
}

export type TypeMatrixRow = Case<TypeMatrixCase>;

/** Every input class, once. The runner owns the actual values. */
export const INPUT_LABELS = [
  'empty-string',
  'text-string',
  'numeric-string',
  'whitespace-string',
  'unicode-string',
  'boxed-string',
  'zero',
  'positive-int',
  'negative-int',
  'negative-zero',
  'float',
  'float-with-zero-fraction',
  'max-safe-int',
  'nan',
  'infinity',
  'negative-infinity',
  'bigint',
  'true',
  'false',
  'null',
  'undefined',
  'empty-array',
  'array-of-one-int',
  'array-of-strings',
  'empty-object',
  'matching-object',
  'date',
  'symbol',
  'enum-member',
] as const;

/**
 * What each type accepts, by contract.
 *
 * - `str` is a primitive string only — never a boxed `String`, never a number.
 * - `int` and `money` are integers: `Number.isInteger`, so `5.0` counts and `NaN`,
 *   `Infinity` and a numeric string do not.
 * - `num` is any *finite* number, so it rejects `NaN` and both infinities.
 * - `enum` here has members `['a','b']`, matched by identity against a string.
 * - `list` here holds ints; `obj` here is `{ n: int() }`.
 *
 * `undefined` is absent-not-invalid and is handled by the required/optional rules
 * rather than by the type, so it is accepted nowhere in this table.
 */
export const ACCEPTS: Record<TypeMatrixCase['type'], readonly string[]> = {
  str: ['empty-string', 'text-string', 'numeric-string', 'whitespace-string', 'unicode-string', 'enum-member'],
  int: ['zero', 'positive-int', 'negative-int', 'negative-zero', 'float-with-zero-fraction', 'max-safe-int'],
  money: ['zero', 'positive-int', 'negative-int', 'negative-zero', 'float-with-zero-fraction', 'max-safe-int'],
  num: [
    'zero',
    'positive-int',
    'negative-int',
    'negative-zero',
    'float',
    'float-with-zero-fraction',
    'max-safe-int',
  ],
  bool: ['true', 'false'],
  enum: ['enum-member'],
  list: ['empty-array', 'array-of-one-int'],
  obj: ['matching-object'],
};

const TYPES = Object.keys(ACCEPTS) as TypeMatrixCase['type'][];

export const TYPE_MATRIX_CASES: TypeMatrixRow[] = TYPES.flatMap((type) =>
  INPUT_LABELS.map((input) => ({
    id: `type-${type}-${input}`,
    src: 'json-schema:test-suite#type',
    type,
    input,
    ok: ACCEPTS[type].includes(input),
  })),
);
