import { describe, expect, it } from 'bun:test';
import {
  bool,
  buildDefault,
  enums,
  int,
  list,
  money,
  obj,
  schema,
  str,
  toJsonSchema,
  validate,
} from './index';

const cartSchema = schema({
  items: list({ productId: str(), qty: int().min(1), unitPrice: money() }),
  coupon: str().nullable(),
});

describe('schema validate', () => {
  it('accepts a valid cart and applies structure', () => {
    const input = { items: [{ productId: 'p1', qty: 2, unitPrice: 1999 }], coupon: null };
    const result = validate(cartSchema, input);

    expect(result.ok).toBe(true);
    expect(result.value).toEqual(input);
  });

  it('rejects wrong primitive kinds with paths', () => {
    const result = validate(cartSchema, { items: [{ productId: 1, qty: 'x', unitPrice: 1 }] });

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.path)).toContain('items[0].productId');
    expect(result.errors.map((e) => e.path)).toContain('items[0].qty');
  });

  it('enforces min bounds', () => {
    const result = validate(cartSchema, { items: [{ productId: 'p', qty: 0, unitPrice: 1 }] });

    expect(result.ok).toBe(false);
    expect(result.errors[0]!.message).toBe('below min 1');
  });

  it('applies defaults and strips unknown keys', () => {
    const type = schema({ qty: int().default(1), name: str() });
    const result = validate(type, { name: 'a', hacked: true });

    expect(result.value).toEqual({ qty: 1, name: 'a' });
  });

  it('handles nullable, optional and required', () => {
    expect(validate(str().nullable(), null).ok).toBe(true);
    expect(validate(str(), null).ok).toBe(false);
    expect(validate(str().optional(), undefined).ok).toBe(true);
    expect(validate(str(), undefined).ok).toBe(false);
  });

  it('validates enums', () => {
    const type = enums(['pending', 'paid']);

    expect(validate(type, 'paid').ok).toBe(true);
    expect(validate(type, 'nope').ok).toBe(false);
  });
});

describe('schema defaults', () => {
  it('builds zero-values, nullables and nested structures', () => {
    expect(buildDefault(cartSchema)).toEqual({ items: [], coupon: null });
    expect(buildDefault(schema({ a: int(), b: bool(), c: enums(['x', 'y']) }))).toEqual({
      a: 0,
      b: false,
      c: 'x',
    });
  });

  it('prefers explicit defaults', () => {
    expect(buildDefault(int().default(5))).toBe(5);
  });
});

describe('schema toJsonSchema', () => {
  it('serializes nested schemas with required lists', () => {
    const json = toJsonSchema(cartSchema) as any;

    expect(json.type).toBe('object');
    expect(json.required).toEqual(['items', 'coupon']);
    expect(json.properties.items.items.properties.qty).toEqual({ type: 'integer', minimum: 1 });
    expect(json.properties.coupon.type).toEqual(['string', 'null']);
  });

  it('marks money format and defaults', () => {
    expect(toJsonSchema(money())).toEqual({ type: 'integer', format: 'money-minor-units' });
    expect((toJsonSchema(int().default(3)) as any).default).toBe(3);
  });

  it('serializes plain obj same as schema', () => {
    expect(toJsonSchema(obj({ a: str() }))).toEqual(toJsonSchema(schema({ a: str() })));
  });
});
