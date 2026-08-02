import type { Case } from '../support/case';

/**
 * The hostile-instance matrix: every builder against the instance classes that
 * look acceptable to a naive check and are not — plus the numbers that look
 * unacceptable and are.
 *
 * Extends the `types-matrix` table with the classic validation traps: boxed
 * primitives are `typeof 'object'`, a `Map`'s entries are not properties, an
 * array-like is not an array, a `Promise` and a `RegExp` pass the object shell
 * with nothing inside. On the accepting side, `Number.isInteger` is true for
 * `2 ** 60` and even `1e308` — `int()` bounds range by `min`/`max`, never by
 * safe-integer, and this table declares that.
 */
export interface HostileInstanceCase {
  /** Which builder is under test. */
  builder: 'str' | 'int' | 'num' | 'bool' | 'money' | 'enum' | 'list' | 'obj';
  /** Label of the instance class; the runner maps it to a value. */
  instance: string;
  ok: boolean;
}

export type HostileInstanceRow = Case<HostileInstanceCase>;

/** Every hostile instance class, once. The runner owns the actual values. */
export const INSTANCE_LABELS = [
  'boxed-number',
  'boxed-boolean',
  'map',
  'set',
  'plain-function',
  'regexp',
  'array-like',
  'promise',
  'unsafe-large-int',
  'huge-float',
  'min-value-float',
] as const;

/**
 * What each builder accepts, by contract.
 *
 * Wrappers, collections, callables and shells are accepted nowhere: `obj` needs
 * its declared fields as own-or-inherited *properties*, which a `Map`, `Set`,
 * `RegExp` or `Promise` never carries, and `list` needs `Array.isArray`. The
 * only true cells are the extreme numbers: `2 ** 60` and `1e308` are integers
 * to `Number.isInteger`, and `Number.MIN_VALUE` is a finite number.
 */
export const INSTANCE_ACCEPTS: Record<HostileInstanceCase['builder'], readonly string[]> = {
  str: [],
  int: ['unsafe-large-int', 'huge-float'],
  num: ['unsafe-large-int', 'huge-float', 'min-value-float'],
  money: ['unsafe-large-int', 'huge-float'],
  bool: [],
  enum: [],
  list: [],
  obj: [],
};

const BUILDERS = Object.keys(INSTANCE_ACCEPTS) as HostileInstanceCase['builder'][];

export const HOSTILE_INSTANCE_CASES: HostileInstanceRow[] = BUILDERS.flatMap((builder) =>
  INSTANCE_LABELS.map((instance) => ({
    id: `sch-inst-${builder}-${instance}`,
    src: 'janux',
    builder,
    instance,
    ok: INSTANCE_ACCEPTS[builder].includes(instance),
  })),
);
