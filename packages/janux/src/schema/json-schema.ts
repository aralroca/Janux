import type { JxType } from './types';

const PRIMITIVE_TYPES: Record<string, string> = {
  string: 'string',
  int: 'integer',
  money: 'integer',
  number: 'number',
  boolean: 'boolean',
};

function baseSchema(type: JxType): Record<string, unknown> {
  if (type.kind === 'enum') return { enum: [...type.values!] };
  if (type.kind === 'list') return { type: 'array', items: toJsonSchema(type.item!) };
  if (type.kind === 'object') return objectSchema(type);

  return { type: PRIMITIVE_TYPES[type.kind] };
}

function objectSchema(type: JxType): Record<string, unknown> {
  const shape = type.shape!;
  const properties = Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [key, toJsonSchema(field)]),
  );
  const required = Object.entries(shape)
    .filter(([, field]) => !field.flags.optional && field.flags.defaultValue === undefined)
    .map(([key]) => key);

  return { type: 'object', properties, required, additionalProperties: false };
}

/**
 * A string constrains length, a number constrains value. Emitting `minimum` for a
 * string is silently useless: every validator ignores it on a string, so the
 * agent never sees a bound Janux will reject it for.
 */
function applyBounds(type: JxType, base: Record<string, unknown>): void {
  const { min, max } = type.flags;
  const isText = type.kind === 'string';

  if (min !== undefined) base[isText ? 'minLength' : 'minimum'] = min;
  if (max !== undefined) base[isText ? 'maxLength' : 'maximum'] = max;
}

/**
 * An enum carries no `type`, so `[base.type, 'null'].flat()` produced the invalid
 * `type: [null, 'null']` — a schema a strict validator refuses outright.
 * Nullability joins the member list instead.
 */
function applyNullable(type: JxType, base: Record<string, unknown>): void {
  if (!type.flags.nullable) return;
  if (type.kind === 'enum') base.enum = [...(base.enum as unknown[]), null];
  else base.type = [base.type, 'null'].flat();
}

/** Serializes a Janux type to standard JSON Schema (for the manifest and MCP tools). */
export function toJsonSchema(type: JxType): Record<string, unknown> {
  const base = baseSchema(type);

  applyNullable(type, base);
  applyBounds(type, base);
  if (type.flags.defaultValue !== undefined) base.default = type.flags.defaultValue;
  if (type.kind === 'money') base.format = 'money-minor-units';
  // Provenance is part of the description of the value, so it travels with it
  // to every client that reads the schema instead of only to Janux's own.
  if (type.flags.untrusted) base['x-janux-untrusted'] = true;

  return base;
}
