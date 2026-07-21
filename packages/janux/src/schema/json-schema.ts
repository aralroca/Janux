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

/** Serializes a Janux type to standard JSON Schema (for the manifest and MCP tools). */
export function toJsonSchema(type: JxType): Record<string, unknown> {
  const base = baseSchema(type);

  if (type.flags.nullable) base.type = [base.type, 'null'].flat();
  if (type.flags.defaultValue !== undefined) base.default = type.flags.defaultValue;
  if (type.flags.min !== undefined) base.minimum = type.flags.min;
  if (type.flags.max !== undefined) base.maximum = type.flags.max;
  if (type.kind === 'money') base.format = 'money-minor-units';

  return base;
}
