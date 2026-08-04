import { describe, expect, it } from 'bun:test';
import { intent, schema, str, int, bool, list, money } from 'janux';
import { toJsonSchema } from 'janux';
import { parseToolArgs, toolList, usageFor } from './run-args';

const addItem = toJsonSchema(schema({ productId: str(), qty: int().min(1).default(1) }));
const filters = toJsonSchema(schema({ tags: list(str()), verbose: bool(), budget: money() }));

describe('parseToolArgs', () => {
  it('types every flag from the schema the tool already declares', () => {
    expect(parseToolArgs(['--productId', 'p1', '--qty', '3'], addItem)).toEqual({ productId: 'p1', qty: 3 });
  });

  it('reads a list or an object flag as JSON', () => {
    expect(parseToolArgs(['--tags', '["a","b"]'], filters)).toEqual({ tags: ['a', 'b'] });
  });

  it('treats a bare boolean flag as true, and an explicit value as itself', () => {
    expect(parseToolArgs(['--verbose'], filters)).toEqual({ verbose: true });
    expect(parseToolArgs(['--verbose', 'false'], filters)).toEqual({ verbose: false });
  });

  it('refuses a flag the schema does not declare, instead of dropping it silently', () => {
    expect(() => parseToolArgs(['--nope', '1'], addItem)).toThrow(/--nope/);
  });

  it('refuses a value the declared type cannot hold', () => {
    expect(() => parseToolArgs(['--qty', 'many'], addItem)).toThrow(/--qty/);
  });

  it('refuses any flag for a tool that declares no input', () => {
    expect(parseToolArgs([], undefined)).toEqual({});
    expect(() => parseToolArgs(['--q', 'x'], undefined)).toThrow(/--q/);
  });

  it('leaves the pipeline to say what is missing — it is the one that validates', () => {
    expect(parseToolArgs([], addItem)).toEqual({});
  });
});

describe('usageFor', () => {
  const tool = {
    name: 'cart.addItem',
    description: 'Add a product to the cart by id',
    guard: 'auto',
    input: addItem,
  };

  it('spells the invocation out of the schema: required bare, optional bracketed', () => {
    const usage = usageFor(tool);

    expect(usage).toContain('janux run cart.addItem --productId <string> [--qty <integer>]');
    expect(usage).toContain('Add a product to the cart by id');
    expect(usage).toContain('--productId');
    expect(usage).toContain('required');
  });

  it('says a tool takes no arguments rather than printing an empty table', () => {
    expect(usageFor({ name: 'api.shop.catalog', guard: 'auto' })).toContain('janux run api.shop.catalog');
  });
});

describe('toolList', () => {
  it('is the manifest, one line per tool, guard included', () => {
    const listing = toolList([
      { name: 'cart.addItem', description: 'Add a product', guard: 'auto' },
      { name: 'api.shop.pay', description: 'Charge the cart', guard: 'confirm' },
    ]);

    expect(listing).toContain('cart.addItem');
    expect(listing).toContain('auto');
    expect(listing).toContain('api.shop.pay');
    expect(listing).toContain('confirm');
    expect(listing).toContain('Charge the cart');
  });
});

describe('the intent factory keeps declaring what the CLI reads', () => {
  it('carries the input schema the usage is generated from', () => {
    const def = intent({ description: 'x', input: schema({ q: str() }), run: () => undefined });

    expect(toJsonSchema(def.input!)).toEqual(toJsonSchema(schema({ q: str() })));
  });
});
