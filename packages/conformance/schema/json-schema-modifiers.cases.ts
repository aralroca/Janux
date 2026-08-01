import { enums, int, list, money, num, obj, schema, str } from 'janux';
import type { JsonSchemaRow } from './json-schema.cases';

/**
 * The JSON Schema projection under modifier combinations.
 *
 * The single-flag rows live in `json-schema.cases.ts`; these pin how the flags
 * compose. The rules that must survive stacking: `optional` is invisible on
 * the type itself (it only exists in the parent's `required` list, at EVERY
 * nesting level), nullability widens the type without displacing bounds,
 * formats or defaults, money never loses its format hint, and `options()` is
 * advisory — it must never leak into the contract the agent is told to honour.
 */
export const JSON_SCHEMA_MODIFIER_CASES: JsonSchemaRow[] = [
  // ── optionality lives in `required`, nowhere else ───────────────────────────
  { id: 'sch-js-optional-is-invisible-on-a-root-scalar', src: 'janux', type: () => str().optional(), expected: { type: 'string' } },
  { id: 'sch-js-optional-and-nullable-still-widen-the-type', src: 'janux', type: () => int().optional().nullable(), expected: { type: ['integer', 'null'] } },
  { id: 'sch-js-an-all-optional-object-requires-nothing', src: 'janux', type: () => obj({ a: int().optional(), b: str().optional() }), expected: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'string' } }, required: [], additionalProperties: false } },
  { id: 'sch-js-nested-optionality-lands-in-the-inner-required', src: 'janux', type: () => obj({ a: obj({ b: int().optional() }) }), expected: { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'integer' } }, required: [], additionalProperties: false } }, required: ['a'], additionalProperties: false } },
  { id: 'sch-js-required-lists-are-per-level', src: 'janux', type: () => obj({ a: obj({ b: int() }), c: int().optional() }), expected: { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'integer' } }, required: ['b'], additionalProperties: false }, c: { type: 'integer' } }, required: ['a'], additionalProperties: false } },
  { id: 'sch-js-item-optionality-is-invisible', src: 'janux', type: () => list(int().optional()), expected: { type: 'array', items: { type: 'integer' } } },

  // ── nullability composes without displacing anything ────────────────────────
  { id: 'sch-js-a-nullable-int-keeps-value-bounds', src: 'janux', type: () => int().nullable().min(1).max(9), expected: { type: ['integer', 'null'], minimum: 1, maximum: 9 } },
  { id: 'sch-js-a-nullable-string-keeps-length-keywords', src: 'janux', type: () => str().nullable().min(1), expected: { type: ['string', 'null'], minLength: 1 } },
  { id: 'sch-js-a-nullable-list-keeps-item-bounds', src: 'janux', type: () => list(int().min(1)).nullable(), expected: { type: ['array', 'null'], items: { type: 'integer', minimum: 1 } } },
  { id: 'sch-js-a-list-of-nullable-items', src: 'janux', type: () => list(int().nullable()), expected: { type: 'array', items: { type: ['integer', 'null'] } } },
  { id: 'sch-js-a-nullable-enum-inside-a-list', src: 'janux', type: () => list(enums(['a', 'b']).nullable()), expected: { type: 'array', items: { enum: ['a', 'b', null] } } },
  { id: 'sch-js-a-nullable-object-with-an-optional-member', src: 'janux', type: () => obj({ a: int().optional() }).nullable(), expected: { type: ['object', 'null'], properties: { a: { type: 'integer' } }, required: [], additionalProperties: false } },

  // ── money never loses its format ────────────────────────────────────────────
  { id: 'sch-js-money-keeps-its-format-through-modifiers', src: 'janux', type: () => money().nullable().default(null).min(0), expected: { type: ['integer', 'null'], minimum: 0, default: null, format: 'money-minor-units' } },
  { id: 'sch-js-a-money-default-is-advertised', src: 'janux', type: () => money().default(500), expected: { type: 'integer', format: 'money-minor-units', default: 500 } },
  { id: 'sch-js-a-money-window', src: 'janux', type: () => money().min(0).max(10000), expected: { type: 'integer', format: 'money-minor-units', minimum: 0, maximum: 10000 } },
  { id: 'sch-js-a-money-field-keeps-its-format-inline', src: 'janux', type: () => obj({ price: money() }), expected: { type: 'object', properties: { price: { type: 'integer', format: 'money-minor-units' } }, required: ['price'], additionalProperties: false } },

  // ── enums ───────────────────────────────────────────────────────────────────
  { id: 'sch-js-an-enum-default-member-is-advertised', src: 'janux', type: () => enums(['a', 'b']).default('a'), expected: { enum: ['a', 'b'], default: 'a' } },
  { id: 'sch-js-a-nullable-enum-default-of-null', src: 'janux', type: () => enums(['a']).nullable().default(null), expected: { enum: ['a', null], default: null } },
  { id: 'sch-js-enum-duplicates-are-preserved', src: 'janux', type: () => enums(['a', 'a']), expected: { enum: ['a', 'a'] } },
  { id: 'sch-js-enum-unicode-members-project-verbatim', src: 'janux', type: () => enums(['ñ', '🎉']), expected: { enum: ['ñ', '🎉'] } },
  { id: 'sch-js-an-empty-string-member-projects', src: 'janux', type: () => enums(['']), expected: { enum: [''] } },
  { id: 'sch-js-an-enum-field-projects-inline', src: 'janux', type: () => obj({ size: enums(['s', 'm']) }), expected: { type: 'object', properties: { size: { enum: ['s', 'm'] } }, required: ['size'], additionalProperties: false } },

  // ── defaults on containers ──────────────────────────────────────────────────
  { id: 'sch-js-a-list-default-is-advertised', src: 'janux', type: () => list(int()).default([1, 2]), expected: { type: 'array', items: { type: 'integer' }, default: [1, 2] } },
  { id: 'sch-js-an-object-default-is-advertised-whole', src: 'janux', type: () => obj({ n: int() }).default({ n: 1 }), expected: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false, default: { n: 1 } } },
  { id: 'sch-js-a-defaulted-list-field-is-not-required', src: 'janux', type: () => obj({ tags: list(str()).default([]) }), expected: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' }, default: [] } }, required: [], additionalProperties: false } },

  // ── bounds project exactly as written ───────────────────────────────────────
  { id: 'sch-js-the-impossible-window-is-projected-verbatim', src: 'janux', type: () => str().min(5).max(2), expected: { type: 'string', minLength: 5, maxLength: 2 } },
  { id: 'sch-js-num-max-alone', src: 'janux', type: () => num().max(9), expected: { type: 'number', maximum: 9 } },
  { id: 'sch-js-a-fractional-bound-is-emitted', src: 'janux', type: () => int().min(1.5), expected: { type: 'integer', minimum: 1.5 } },
  { id: 'sch-js-negative-bounds-are-emitted', src: 'janux', type: () => int().min(-5).max(-1), expected: { type: 'integer', minimum: -5, maximum: -1 } },

  // ── structure and naming ────────────────────────────────────────────────────
  { id: 'sch-js-schema-root-projects-like-obj', src: 'janux', type: () => schema({ n: int() }), expected: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } },
  { id: 'sch-js-a-list-of-lists-of-objects', src: 'janux', type: () => list(list(obj({ n: int() }))), expected: { type: 'array', items: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } } } },
  { id: 'sch-js-a-key-with-spaces-survives', src: 'janux', type: () => obj({ 'user name': str() }), expected: { type: 'object', properties: { 'user name': { type: 'string' } }, required: ['user name'], additionalProperties: false } },
  { id: 'sch-js-a-unicode-key-survives', src: 'janux', type: () => obj({ 'ñandú': int() }), expected: { type: 'object', properties: { 'ñandú': { type: 'integer' } }, required: ['ñandú'], additionalProperties: false } },
  { id: 'sch-js-nullability-at-two-levels-at-once', src: 'janux', type: () => obj({ a: obj({ b: str().nullable() }).nullable() }), expected: { type: 'object', properties: { a: { type: ['object', 'null'], properties: { b: { type: ['string', 'null'] } }, required: ['b'], additionalProperties: false } }, required: ['a'], additionalProperties: false } },

  // ── advisory options never reach the contract ───────────────────────────────
  { id: 'sch-js-options-are-not-projected', src: 'janux', type: () => int().options(() => [1, 2]), expected: { type: 'integer' } },
];
