import type { Case } from '../support/case';

/**
 * The absence matrix: every kind × every presence modifier × the two ways a
 * value can not be there.
 *
 * Absent (`undefined`) and `null` are resolved BEFORE kind dispatch, so the
 * verdict is a function of the modifier alone — an `int()` and an `obj()` must
 * treat a missing value identically. This table pins that uniformity: a
 * kind-specific absent-handling regression (say, a list that starts treating
 * `null` as `[]`) flips a cell here.
 *
 * The rules under test: `required` refuses both; `optional` accepts only
 * absence; `nullable` accepts both (a missing nullable normalizes to `null`);
 * `nullish` is the union; a default fires on absence but never on an explicit
 * `null` — null is a value, not a gap.
 */
export interface AbsenceMatrixCase {
  kind: 'str' | 'int' | 'num' | 'bool' | 'money' | 'enum' | 'list' | 'obj';
  modifier: 'required' | 'optional' | 'nullable' | 'nullish' | 'defaulted';
  presence: 'absent' | 'null';
  ok: boolean;
}

export type AbsenceMatrixRow = Case<AbsenceMatrixCase>;

const KINDS = ['str', 'int', 'num', 'bool', 'money', 'enum', 'list', 'obj'] as const;
const PRESENCES = ['absent', 'null'] as const;

/** The contract: one verdict per modifier × presence, identical for every kind. */
export const PRESENCE_VERDICTS: Record<AbsenceMatrixCase['modifier'], Record<AbsenceMatrixCase['presence'], boolean>> = {
  required: { absent: false, null: false },
  optional: { absent: true, null: false },
  nullable: { absent: true, null: true },
  nullish: { absent: true, null: true },
  defaulted: { absent: true, null: false },
};

const MODIFIERS = Object.keys(PRESENCE_VERDICTS) as AbsenceMatrixCase['modifier'][];

export const ABSENCE_MATRIX_CASES: AbsenceMatrixRow[] = KINDS.flatMap((kind) =>
  MODIFIERS.flatMap((modifier) =>
    PRESENCES.map((presence) => ({
      id: `sch-absent-${kind}-${modifier}-${presence}`,
      src: 'janux',
      kind,
      modifier,
      presence,
      ok: PRESENCE_VERDICTS[modifier][presence],
    })),
  ),
);
