import { describe, expect } from 'bun:test';
import { bool, enums, int, list, money, num, obj, str, validate, type JxType } from 'janux';
import { runCases } from '../support/scenario';
import { HOSTILE_INSTANCE_CASES, type HostileInstanceRow } from './hostile-instances.cases';

/** One value per instance label. The labels are the contract; these are the instances. */
const VALUES: Record<string, unknown> = {
  'boxed-number': new Number(5),
  'boxed-boolean': new Boolean(true),
  map: new Map([['n', 1]]),
  set: new Set([1]),
  'plain-function': () => 1,
  regexp: /x/,
  'array-like': { 0: 1, length: 1 },
  promise: Promise.resolve(1),
  'unsafe-large-int': 2 ** 60,
  'huge-float': 1e308,
  'min-value-float': Number.MIN_VALUE,
};

const BUILDERS: Record<HostileInstanceRow['builder'], () => JxType> = {
  str,
  int,
  num,
  bool,
  money,
  enum: () => enums(['a', 'b']),
  list: () => list(int()),
  obj: () => obj({ n: int() }),
};

describe('hostile instance matrix', () =>
  runCases(HOSTILE_INSTANCE_CASES, (row) => {
    expect(validate(BUILDERS[row.builder](), VALUES[row.instance]).ok).toBe(row.ok);
  }));
