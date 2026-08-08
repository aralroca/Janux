import type { JxType } from './types';

const ZERO_VALUES: Record<string, unknown> = {
  string: '',
  int: 0,
  money: 0,
  number: 0,
  boolean: false,
};

/**
 * Builds the initial value for a schema: explicit `.default()` wins, then
 * `null` for nullables, `[]` for lists, recursion for objects, first value
 * for enums, and the kind's zero value for primitives.
 */
export function buildDefault(type: JxType): unknown {
  if (type.flags.defaultValue !== undefined) return type.flags.defaultValue;
  if (type.flags.nullable) return null;
  if (type.kind === 'json') return null;
  if (type.kind === 'list') return [];
  if (type.kind === 'enum') return type.values![0];
  if (type.kind === 'object') return buildObjectDefault(type);

  return ZERO_VALUES[type.kind];
}

function buildObjectDefault(type: JxType): Record<string, unknown> {
  const entries = Object.entries(type.shape!).map(([key, fieldType]) => [
    key,
    buildDefault(fieldType),
  ]);

  return Object.fromEntries(entries);
}
