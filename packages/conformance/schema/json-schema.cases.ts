import { bool, enums, int, list, money, num, obj, str, type JxType } from 'janux';
import type { Case } from '../support/case';

/**
 * The JSON Schema projection — the agent's half of "one component, two faces".
 *
 * A wrong projection is worse than a missing one: the model is told a contract
 * Janux will not honour, so it cannot self-correct and gets rejections it could
 * not have predicted. Every row is the exact object a validator would receive.
 */
export interface JsonSchemaCase {
  type: () => JxType;
  expected: Record<string, unknown>;
}

export type JsonSchemaRow = Case<JsonSchemaCase>;

export const JSON_SCHEMA_CASES: JsonSchemaRow[] = [
  // ── primitives ──────────────────────────────────────────────────────────────
  { id: 'js-string', src: 'janux', type: () => str(), expected: { type: 'string' } },
  { id: 'js-int-projects-as-integer', src: 'janux', type: () => int(), expected: { type: 'integer' } },
  { id: 'js-number', src: 'janux', type: () => num(), expected: { type: 'number' } },
  { id: 'js-boolean', src: 'janux', type: () => bool(), expected: { type: 'boolean' } },
  { id: 'js-money-is-an-integer-with-a-format-hint', src: 'janux', type: () => money(), expected: { type: 'integer', format: 'money-minor-units' } },

  // ── bounds use the keyword the value kind actually supports ─────────────────
  { id: 'js-string-min-becomes-minlength', src: 'janux', type: () => str().min(3), expected: { type: 'string', minLength: 3 } },
  { id: 'js-string-max-becomes-maxlength', src: 'janux', type: () => str().max(10), expected: { type: 'string', maxLength: 10 } },
  { id: 'js-string-both-bounds-become-length-keywords', src: 'janux', type: () => str().min(3).max(10), expected: { type: 'string', minLength: 3, maxLength: 10 } },
  { id: 'js-int-min-becomes-minimum', src: 'janux', type: () => int().min(1), expected: { type: 'integer', minimum: 1 } },
  { id: 'js-int-max-becomes-maximum', src: 'janux', type: () => int().max(9), expected: { type: 'integer', maximum: 9 } },
  { id: 'js-number-bounds-become-value-keywords', src: 'janux', type: () => num().min(0).max(1), expected: { type: 'number', minimum: 0, maximum: 1 } },
  { id: 'js-money-bounds-become-value-keywords', src: 'janux', type: () => money().min(0), expected: { type: 'integer', format: 'money-minor-units', minimum: 0 } },
  { id: 'js-a-zero-bound-is-emitted-not-dropped', src: 'janux', type: () => int().min(0), expected: { type: 'integer', minimum: 0 } },

  // ── nullability ─────────────────────────────────────────────────────────────
  { id: 'js-nullable-string-widens-the-type', src: 'janux', type: () => str().nullable(), expected: { type: ['string', 'null'] } },
  { id: 'js-nullable-int-widens-the-type', src: 'janux', type: () => int().nullable(), expected: { type: ['integer', 'null'] } },
  { id: 'js-nullable-list-widens-the-type', src: 'janux', type: () => list(int()).nullable(), expected: { type: ['array', 'null'], items: { type: 'integer' } } },
  { id: 'js-nullable-object-widens-the-type', src: 'janux', type: () => obj({ n: int() }).nullable(), expected: { type: ['object', 'null'], properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } },
  { id: 'js-nullable-enum-adds-null-to-the-members', src: 'janux', type: () => enums(['a', 'b']).nullable(), expected: { enum: ['a', 'b', null] } },
  { id: 'js-nullable-enum-never-emits-a-type-array', src: 'janux', type: () => enums(['a']).nullable(), expected: { enum: ['a', null] } },

  // ── defaults ────────────────────────────────────────────────────────────────
  { id: 'js-default-is-advertised', src: 'janux', type: () => int().default(7), expected: { type: 'integer', default: 7 } },
  { id: 'js-default-of-zero-is-advertised', src: 'janux', type: () => int().default(0), expected: { type: 'integer', default: 0 } },
  { id: 'js-default-of-false-is-advertised', src: 'janux', type: () => bool().default(false), expected: { type: 'boolean', default: false } },
  { id: 'js-default-of-empty-string-is-advertised', src: 'janux', type: () => str().default(''), expected: { type: 'string', default: '' } },
  { id: 'js-default-of-null-is-advertised-on-a-nullable', src: 'janux', type: () => int().nullable().default(null), expected: { type: ['integer', 'null'], default: null } },

  // ── enum, list, object ──────────────────────────────────────────────────────
  { id: 'js-enum-lists-its-members', src: 'janux', type: () => enums(['a', 'b']), expected: { enum: ['a', 'b'] } },
  { id: 'js-empty-enum-projects-an-empty-member-list', src: 'janux', type: () => enums([]), expected: { enum: [] } },
  { id: 'js-list-of-primitives', src: 'janux', type: () => list(int()), expected: { type: 'array', items: { type: 'integer' } } },
  { id: 'js-list-of-objects', src: 'janux', type: () => list({ n: int() }), expected: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } } },
  { id: 'js-nested-list', src: 'janux', type: () => list(list(str())), expected: { type: 'array', items: { type: 'array', items: { type: 'string' } } } },
  { id: 'js-object-forbids-extra-properties', src: 'janux', type: () => obj({ n: int() }), expected: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } },
  { id: 'js-empty-object-has-no-required-members', src: 'janux', type: () => obj({}), expected: { type: 'object', properties: {}, required: [], additionalProperties: false } },

  // ── what counts as required ─────────────────────────────────────────────────
  { id: 'js-optional-field-is-not-required', src: 'janux', type: () => obj({ a: int(), b: int().optional() }), expected: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a'], additionalProperties: false } },
  { id: 'js-defaulted-field-is-not-required', src: 'janux', type: () => obj({ a: int(), b: int().default(1) }), expected: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer', default: 1 } }, required: ['a'], additionalProperties: false } },
  { id: 'js-nullable-field-is-still-required', src: 'janux', type: () => obj({ a: int().nullable() }), expected: { type: 'object', properties: { a: { type: ['integer', 'null'] } }, required: ['a'], additionalProperties: false } },
  { id: 'js-required-preserves-shape-order', src: 'janux', type: () => obj({ b: int(), a: int() }), expected: { type: 'object', properties: { b: { type: 'integer' }, a: { type: 'integer' } }, required: ['b', 'a'], additionalProperties: false } },

  // ── nesting carries every flag down ─────────────────────────────────────────
  { id: 'js-a-nested-string-bound-uses-length-keywords', src: 'janux', type: () => obj({ name: str().min(1).max(8) }), expected: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 8 } }, required: ['name'], additionalProperties: false } },
  { id: 'js-a-list-item-bound-uses-value-keywords', src: 'janux', type: () => list(int().min(1)), expected: { type: 'array', items: { type: 'integer', minimum: 1 } } },
  { id: 'js-a-deeply-nested-shape-projects-fully', src: 'janux', type: () => obj({ a: obj({ b: list({ c: money() }) }) }), expected: { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'array', items: { type: 'object', properties: { c: { type: 'integer', format: 'money-minor-units' } }, required: ['c'], additionalProperties: false } } }, required: ['b'], additionalProperties: false } }, required: ['a'], additionalProperties: false } },
];
