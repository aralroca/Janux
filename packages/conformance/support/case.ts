/**
 * A corpus row: one distinct behaviour, plus where we learnt it.
 *
 * Rows live in `*.cases.ts` files as plain data so `no-duplicate-cases.test.ts`
 * can fingerprint every one of them without executing a single assertion.
 */
export type Case<T> = T & {
  /** Unique across the whole corpus — the dup guard fails the build otherwise. */
  id: string;
  /** `<framework>:<suite>#<case>` when ported, `janux` when the case is ours. */
  src: string;
};

/** Keys that identify a row rather than describe its behaviour. */
const IDENTITY_KEYS = new Set(['id', 'src']);

function primitive(value: unknown): string {
  if (typeof value === 'function') return `fn:${value.toString()}`;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol' || value === undefined) return String(value);
  // `JSON.stringify(-0)` is `"0"`, which would fingerprint two genuinely
  // different inputs as the same case.
  if (Object.is(value, -0)) return '-0';

  return JSON.stringify(value)!;
}

function members(value: object): string {
  return Object.keys(value)
    .sort()
    .map((key) => `${key}:${serialize((value as Record<string, unknown>)[key])}`)
    .join(',');
}

/** Order-insensitive on object keys, so two rows that differ only in key order collide. */
export function serialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return primitive(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  if (value instanceof Map) return `Map(${serialize([...value.entries()])})`;
  if (value instanceof Set) return `Set(${serialize([...value])})`;
  if (value instanceof RegExp) return `RegExp(${value.source}/${value.flags})`;

  return `{${members(value)}}`;
}

/** The behavioural fingerprint of a row: everything except its identity. */
export function caseKey(row: object): string {
  const behaviour = Object.entries(row).filter(([key]) => !IDENTITY_KEYS.has(key));

  return serialize(Object.fromEntries(behaviour));
}

/** True when `value` looks like a corpus table, so the guard can walk arbitrary exports. */
export function isCaseTable(value: unknown): value is Case<object>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isCase);
}

function isCase(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'id' in value && 'src' in value;
}
