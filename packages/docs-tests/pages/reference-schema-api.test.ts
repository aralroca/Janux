import { describe, expect, it } from 'bun:test';
import { bool, buildDefault, enums, int, list, money, num, obj, schema, str, toJsonSchema, validate } from 'janux';

/**
 * reference/schema-api.md and guide/schema.md are two tables and a precedence
 * rule. Every row of both tables is asserted here — projection and zero value —
 * plus the missing-value precedence, key stripping and the error-path format the
 * pages promise.
 */

const BUILDERS = [
  { name: 'str', type: str(), projection: { type: 'string' }, zero: '' },
  { name: 'int', type: int(), projection: { type: 'integer' }, zero: 0 },
  { name: 'num', type: num(), projection: { type: 'number' }, zero: 0 },
  { name: 'bool', type: bool(), projection: { type: 'boolean' }, zero: false },
  { name: 'money', type: money(), projection: { type: 'integer', format: 'money-minor-units' }, zero: 0 },
  { name: 'enums', type: enums(['a', 'b']), projection: { enum: ['a', 'b'] }, zero: 'a' },
  { name: 'list', type: list(str()), projection: { type: 'array' }, zero: [] },
];

describe('reference/schema-api.md — the builder table', () => {
  for (const { name, type, projection, zero } of BUILDERS) {
    it(`${name}() projects and zero-values as documented`, () => {
      expect(toJsonSchema(type)).toMatchObject(projection);
      expect(buildDefault(type)).toEqual(zero);
    });
  }

  it('obj()/schema() project properties + required and default recursively', () => {
    const cart = schema({ items: list({ id: str(), qty: int() }), note: str().optional() });

    expect(toJsonSchema(cart)).toMatchObject({ type: 'object', required: ['items'] });
    // Zero values all the way down — an optional field still boots as '' rather
    // than a missing key, so state shape never surprises a view.
    expect(buildDefault(cart)).toEqual({ items: [], note: '' });
  });

  it('list({...}) is shorthand for list(obj({...}))', () => {
    expect(toJsonSchema(list({ id: str() }))).toEqual(toJsonSchema(list(obj({ id: str() }))));
  });
});

describe('reference/schema-api.md — modifiers', () => {
  it('are chainable and immutable: each returns a new type', () => {
    const base = int();
    const bounded = base.min(1).max(99);

    expect(validate(base, 0).ok).toBe(true);
    expect(validate(bounded, 0).ok).toBe(false);
    expect(validate(bounded, 50).ok).toBe(true);
  });

  it('nullable widens the projected type to include null', () => {
    expect(toJsonSchema(str().nullable())).toMatchObject({ type: ['string', 'null'] });
    expect(validate(str().nullable(), null).ok).toBe(true);
  });

  it('default() applies when missing and removes the key from required', () => {
    const withDefault = schema({ n: int().default(7) });

    expect(toJsonSchema(withDefault).required ?? []).not.toContain('n');
    expect(validate(withDefault, {}).value).toEqual({ n: 7 });
  });

  it('min/max bound string length as well as numbers', () => {
    expect(validate(str().min(2), 'a').ok).toBe(false);
    expect(validate(str().min(2), 'ab').ok).toBe(true);
    expect(validate(str().max(2), 'abc').ok).toBe(false);
  });
});

describe('reference/schema-api.md — validate()', () => {
  it('resolves a missing value in the documented order', () => {
    expect(validate(schema({ a: int().default(3) }), {}).value).toEqual({ a: 3 }); // default wins
    expect(validate(schema({ a: int().optional() }), {}).value).toEqual({ a: undefined }); // then optional
    expect(validate(schema({ a: int().nullable() }), {}).value).toEqual({ a: null }); // then nullable
    const required = validate(schema({ a: int() }), {});

    expect(required.ok).toBe(false);
    expect(required.errors[0]).toMatchObject({ path: 'a', message: 'required' });
  });

  it('strips unknown keys instead of passing them through', () => {
    const result = validate(schema({ known: str() }), { known: 'x', sneaky: 'y' });

    expect(result.value).toEqual({ known: 'x' });
  });

  it('reports precise paths inside lists', () => {
    const cart = schema({ items: list({ qty: int().min(1) }) });
    const result = validate(cart, { items: [{ qty: 0 }] });

    expect(result.ok).toBe(false);
    expect(`${result.errors[0]!.path}: ${result.errors[0]!.message}`).toBe('items[0].qty: below min 1');
  });

  it('enums accept only their closed set', () => {
    const plan = enums(['free', 'pro']);

    expect(validate(plan, 'pro').ok).toBe(true);
    expect(validate(plan, 'enterprise').ok).toBe(false);
  });

  it('money is an integer in minor units — no floats', () => {
    expect(validate(money(), 2500).ok).toBe(true);
    expect(validate(money(), 25.5).ok).toBe(false);
  });
});
