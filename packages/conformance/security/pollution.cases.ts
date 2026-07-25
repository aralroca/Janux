import type { Case } from '../support/case';

/**
 * Prototype pollution against every entry point that accepts untrusted keys.
 *
 * The cross product is the point: each entry point is a different code path with
 * its own key handling — schema validation builds output from a declared shape, the
 * state proxy writes through `Reflect.set`, `hashKey` walks an arbitrary object,
 * route params come off a URL, an i18n query becomes placeholder lookups. A
 * defence in one is no evidence about the others, which is exactly how this class
 * of bug survives.
 *
 * Every row asserts the same two things: `Object.prototype` is untouched
 * afterwards, and the polluting key never appears as data where the schema did not
 * declare it.
 */
export interface PollutionCase {
  entry:
    | 'schema-validate'
    | 'schema-nested'
    | 'schema-list-item'
    | 'state-write'
    | 'state-initial'
    | 'snapshot-resume'
    | 'query-hash'
    | 'intent-input'
    | 'i18n-query';
  /** The key an attacker controls. */
  key: string;
}

export type PollutionRow = Case<PollutionCase & { strips: boolean }>;

/**
 * Which entry points *strip* an undeclared key, and which legitimately carry it.
 *
 * Both groups must leave `Object.prototype` untouched — that is the pollution
 * invariant and it is asserted everywhere. But only a path with a schema behind it
 * knows which keys are allowed, so only those can strip. A raw reactive state
 * object has no declaration to check against, and `hashKey` *must* keep the key or
 * two different cache keys would collide. Saying so per entry point is the point of
 * the matrix: it documents where the boundary actually is.
 */
const STRIPS: Record<PollutionCase['entry'], boolean> = {
  'schema-validate': true,
  'schema-nested': true,
  'schema-list-item': true,
  'snapshot-resume': true,
  'intent-input': true,
  'state-write': false,
  'state-initial': false,
  'query-hash': false,
  'i18n-query': false,
};

/** Each is a distinct pollution primitive, not a spelling variant. */
const KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
];

const ENTRIES: PollutionCase['entry'][] = [
  'schema-validate',
  'schema-nested',
  'schema-list-item',
  'state-write',
  'state-initial',
  'snapshot-resume',
  'query-hash',
  'intent-input',
  'i18n-query',
];

export const POLLUTION_CASES: PollutionRow[] = ENTRIES.flatMap((entry) =>
  KEYS.map((key) => ({
    id: `pollute-${entry}-${key.replace(/_/g, '')}`.toLowerCase(),
    src: 'janux',
    entry,
    key,
    strips: STRIPS[entry],
  })),
);
