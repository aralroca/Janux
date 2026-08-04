import { describe, expect, it } from 'bun:test';
import { applyEdits, collect, parseModule, spanOf } from './ast';

describe('parseModule', () => {
  it('parses JSX out of a .tsx file', () => {
    const parsed = parseModule('const a = <b>hi</b>;\n', 'a.tsx');

    expect(parsed).toBeDefined();
    expect(collect(parsed!.module, 'JSXElement')).toHaveLength(1);
  });

  it('parses JSX out of a .ts file too — the repo writes JSX in both', () => {
    const parsed = parseModule('const a = <b>hi</b>;\n', 'a.ts');

    expect(collect(parsed!.module, 'JSXElement')).toHaveLength(1);
  });

  it('answers undefined for source it cannot parse, instead of throwing at the caller', () => {
    expect(parseModule('const = = =;', 'a.ts')).toBeUndefined();
  });
});

describe('spanOf', () => {
  it('locates a node by byte offset, so non-ASCII above it does not shift it', () => {
    const code = `const label = '→→→ ñ';\n<button on={intents.add}>ok</button>;\n`;
    const parsed = parseModule(code, 'a.tsx')!;
    const [attribute] = collect(parsed.module, 'JSXAttribute');
    const { start, end } = spanOf(attribute, parsed.base);

    expect(Buffer.from(code, 'utf8').subarray(start, end).toString('utf8')).toBe('on={intents.add}');
  });
});

describe('applyEdits', () => {
  it('returns the source untouched when there is nothing to apply', () => {
    expect(applyEdits('const a = 1;\n', [])).toBe('const a = 1;\n');
  });

  it('splices every edit, and later edits are not shifted by earlier ones', () => {
    const code = 'aaa bbb ccc';

    expect(applyEdits(code, [{ start: 4, end: 7, text: 'BBBB' }, { start: 0, end: 3, text: 'A' }])).toBe('A BBBB ccc');
  });

  it('splices by byte offset, so an edit after a multi-byte character lands where the span said', () => {
    const code = '→ bbb';
    const start = Buffer.from('→ ', 'utf8').length;

    expect(applyEdits(code, [{ start, end: start + 3, text: 'BBB' }])).toBe('→ BBB');
  });

  it('refuses overlapping edits rather than silently corrupting the file', () => {
    expect(() => applyEdits('aaaa', [{ start: 0, end: 3, text: 'x' }, { start: 2, end: 4, text: 'y' }])).toThrow(
      /overlapping/,
    );
  });
});
