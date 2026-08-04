import { describe, expect, it } from 'bun:test';
import { applyEdits, parseModule, collect } from './ast';
import { entryNamed, removeEntry } from './object-edits';

/** The object literal in `const x = { … }`, with the offset its spans are relative to. */
function literal(code: string) {
  const parsed = parseModule(code, 'x.ts')!;
  const [declarator] = collect(parsed.module, 'VariableDeclarator');

  return { object: declarator.init, base: parsed.base };
}

const without = (code: string, key: string) => {
  const { object, base } = literal(code);

  return applyEdits(code, [removeEntry(object, entryNamed(object, key), base, code)]);
};

describe('removeEntry', () => {
  it('takes the separator after it when another property follows', () => {
    expect(without("const x = { a: 1, b: 2 };\n", 'a')).toBe('const x = { b: 2 };\n');
  });

  it('takes the separator before it when it is last', () => {
    expect(without("const x = {\n  a: 1,\n  b: 2,\n};\n", 'b')).toBe('const x = {\n  a: 1,\n};\n');
  });

  it('leaves an empty literal, not a stray comma, when it was the only property', () => {
    expect(without('const x = { a: 1 };\n', 'a')).toBe('const x = {  };\n');
  });

  /**
   * The realistic shape: a formatter writes a trailing comma on a multi-line
   * object, so removing the only property leaves `{ , }` unless the comma goes
   * with it — source that does not parse, written by a tool that was asked to
   * be careful.
   */
  it('takes the trailing comma too when it was the only property', () => {
    expect(without("const x = {\n  a: 1,\n};\n", 'a')).toBe('const x = {\n  \n};\n');
  });
});
