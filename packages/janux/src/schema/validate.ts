import type { JxType } from './types';

export interface JxError {
  path: string;
  message: string;
}

export interface JxResult {
  ok: boolean;
  value: unknown;
  errors: JxError[];
}

const PRIMITIVE_CHECKS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === 'string',
  int: (v) => Number.isInteger(v),
  money: (v) => Number.isInteger(v),
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
};

function fail(path: string, message: string): JxResult {
  return { ok: false, value: undefined, errors: [{ path, message }] };
}

function pass(value: unknown): JxResult {
  return { ok: true, value, errors: [] };
}

function checkBounds(type: JxType, value: unknown, path: string): JxResult {
  const { min, max } = type.flags;
  const size = typeof value === 'string' ? value.length : (value as number);

  if (min !== undefined && size < min) return fail(path, `below min ${min}`);
  if (max !== undefined && size > max) return fail(path, `above max ${max}`);

  return pass(value);
}

function validatePrimitive(type: JxType, value: unknown, path: string): JxResult {
  const check = PRIMITIVE_CHECKS[type.kind];

  if (!check!(value)) return fail(path, `expected ${type.kind}`);

  return checkBounds(type, value, path);
}

function validateEnum(type: JxType, value: unknown, path: string): JxResult {
  if (!type.values!.includes(value as string)) {
    return fail(path, `expected one of: ${type.values!.join(', ')}`);
  }

  return pass(value);
}

function validateList(type: JxType, value: unknown, path: string): JxResult {
  if (!Array.isArray(value)) return fail(path, 'expected list');

  // `Array.from` visits holes as `undefined`; `.map` skips them, so `[1, , 3]`
  // would pass a non-nullable list and leave a hole where an item is required.
  const results = Array.from(value, (item, i) => validate(type.item!, item, `${path}[${i}]`));
  const errors = results.flatMap((r) => r.errors);

  if (errors.length > 0) return { ok: false, value: undefined, errors };

  return pass(results.map((r) => r.value));
}

function validateObject(type: JxType, value: unknown, path: string): JxResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'expected object');
  }

  const entries = Object.entries(type.shape!).map(([key, fieldType]) => {
    const fieldPath = path === '' ? key : `${path}.${key}`;

    return [key, validate(fieldType, (value as any)[key], fieldPath)] as const;
  });
  const errors = entries.flatMap(([, r]) => r.errors);

  if (errors.length > 0) return { ok: false, value: undefined, errors };

  return pass(Object.fromEntries(entries.map(([key, r]) => [key, r.value])));
}

function validatePresent(type: JxType, value: unknown, path: string): JxResult {
  if (type.kind === 'enum') return validateEnum(type, value, path);
  if (type.kind === 'list') return validateList(type, value, path);
  if (type.kind === 'object') return validateObject(type, value, path);

  return validatePrimitive(type, value, path);
}

/** Validates a value against a schema, applying defaults. Unknown object keys are stripped. */
export function validate(type: JxType, value: unknown, path = ''): JxResult {
  if (value === undefined) {
    // A default is validated like any other value. An unchecked one puts a value
    // into state that the schema says is impossible — and hands the agent a JSON
    // Schema contradicting what it will actually receive. Recursion terminates
    // because a default of `undefined` never reaches here.
    if (type.flags.defaultValue !== undefined) return validate(type, type.flags.defaultValue, path);
    if (type.flags.optional) return pass(undefined);
    if (type.flags.nullable) return pass(null);

    return fail(path, 'required');
  }
  if (value === null) {
    return type.flags.nullable ? pass(null) : fail(path, 'not nullable');
  }

  return validatePresent(type, value, path);
}
