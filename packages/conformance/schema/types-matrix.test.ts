import { describe, expect } from 'bun:test';
import { bool, enums, int, list, money, num, obj, str, validate, type JxType } from 'janux';
import { runCases } from '../support/scenario';
import { TYPE_MATRIX_CASES, type TypeMatrixRow } from './types-matrix.cases';

/** One value per input label. The labels are the contract; these are the instances. */
const VALUES: Record<string, unknown> = {
  'empty-string': '',
  'text-string': 'x',
  'numeric-string': '1',
  'whitespace-string': '   ',
  'unicode-string': 'ñ🎉',
  'boxed-string': new String('x'),
  zero: 0,
  'positive-int': 7,
  'negative-int': -7,
  'negative-zero': -0,
  float: 1.5,
  'float-with-zero-fraction': 5.0,
  'max-safe-int': Number.MAX_SAFE_INTEGER,
  nan: Number.NaN,
  infinity: Number.POSITIVE_INFINITY,
  'negative-infinity': Number.NEGATIVE_INFINITY,
  bigint: 1n,
  true: true,
  false: false,
  null: null,
  undefined: undefined,
  'empty-array': [],
  'array-of-one-int': [1],
  'array-of-strings': ['a'],
  'empty-object': {},
  'matching-object': { n: 1 },
  date: new Date(0),
  symbol: Symbol('s'),
  'enum-member': 'a',
};

const BUILDERS: Record<TypeMatrixRow['type'], () => JxType> = {
  str,
  int,
  num,
  bool,
  money,
  enum: () => enums(['a', 'b']),
  list: () => list(int()),
  obj: () => obj({ n: int() }),
};

describe('type conformance matrix', () =>
  runCases(TYPE_MATRIX_CASES, (row) => {
    expect(validate(BUILDERS[row.type](), VALUES[row.input]).ok).toBe(row.ok);
  }));
