import { describe, expect } from 'bun:test';
import { bool, enums, int, list, money, num, obj, str, validate, type JxType } from 'janux';
import { runCases } from '../support/scenario';
import { ABSENCE_MATRIX_CASES, type AbsenceMatrixRow } from './absence-matrix.cases';

const BASES: Record<AbsenceMatrixRow['kind'], () => JxType> = {
  str,
  int,
  num,
  bool,
  money,
  enum: () => enums(['a', 'b']),
  list: () => list(int()),
  obj: () => obj({ n: int() }),
};

/** A valid default per kind, so `defaulted` cells isolate presence handling. */
const DEFAULTS: Record<AbsenceMatrixRow['kind'], unknown> = {
  str: 's',
  int: 1,
  num: 0.5,
  bool: true,
  money: 100,
  enum: 'b',
  list: [2],
  obj: { n: 2 },
};

const MODIFIERS: Record<AbsenceMatrixRow['modifier'], (base: JxType, kind: AbsenceMatrixRow['kind']) => JxType> = {
  required: (base) => base,
  optional: (base) => base.optional(),
  nullable: (base) => base.nullable(),
  nullish: (base) => base.optional().nullable(),
  defaulted: (base, kind) => base.default(DEFAULTS[kind]),
};

describe('absence conformance matrix', () =>
  runCases(ABSENCE_MATRIX_CASES, (row) => {
    const type = MODIFIERS[row.modifier](BASES[row.kind](), row.kind);

    expect(validate(type, row.presence === 'absent' ? undefined : null).ok).toBe(row.ok);
  }));
