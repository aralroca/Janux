import type { JxType } from './types';

const NUMERIC_KINDS = new Set(['int', 'number', 'money']);

/** `Number('')` is 0 and `Number('  ')` too — a blank field must stay invalid, not become a value. */
function coerceNumeric(value: string): unknown {
  const parsed = Number(value);

  return value.trim() === '' || Number.isNaN(parsed) ? value : parsed;
}

/**
 * Checkbox semantics: a checked box submits `'on'`, an unchecked one is simply
 * absent — unless the field is optional/nullable, where absent means absent
 * (an agent omitting the field must not receive `false`). `'false'`/`'off'`
 * cover the hidden-input-paired-with-checkbox and true/false `<select>` idioms.
 */
function coerceBoolean(value: unknown, type: JxType): unknown {
  if (value === undefined) return type.flags?.optional || type.flags?.nullable ? value : false;
  if (value === 'on' || value === 'true') return true;

  return value === 'off' || value === 'false' ? false : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceObject(value: Record<string, unknown>, type: JxType): Record<string, unknown> {
  const coerced = Object.entries(type.shape!).map(([key, field]) => [key, coerceForm(value[key], field)]);

  return { ...value, ...Object.fromEntries(coerced) };
}

/**
 * Pre-validation coercion for `coerce: 'form'` intents: FormData delivers only
 * strings, so string values are converted to what the typed schema means —
 * numbers via `Number` (a blank field stays invalid), booleans via checkbox
 * semantics. `money()` parses numerically but is NEVER scaled: minor units in,
 * minor units out. Already-typed values pass through untouched, and the
 * existing validation still has the final word.
 */
export function coerceForm(value: unknown, type: JxType): unknown {
  if (type.kind === 'boolean') return coerceBoolean(value, type);
  if (typeof value === 'string' && NUMERIC_KINDS.has(type.kind)) return coerceNumeric(value);
  if (type.kind === 'object' && isRecord(value)) return coerceObject(value, type);
  if (type.kind === 'list' && Array.isArray(value)) return value.map((item) => coerceForm(item, type.item!));

  return value;
}
