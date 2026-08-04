import { describe, expect, it } from 'bun:test';
import { unifiedDiff } from './diff';

describe('unifiedDiff', () => {
  it('is empty when nothing changed, so an unchanged file prints nothing', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n', 'x.ts')).toBe('');
  });

  it('names both sides of the file it is diffing', () => {
    expect(unifiedDiff('a\n', 'b\n', 'src/x.ts')).toContain('--- a/src/x.ts\n+++ b/src/x.ts\n');
  });

  it('marks the replaced line and keeps the surrounding lines as context', () => {
    const diff = unifiedDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\n', 'x.ts');

    expect(diff).toContain('@@ -1,3 +1,3 @@');
    expect(diff).toContain('\n one\n-two\n+TWO\n three\n');
  });

  it('marks an inserted line without inventing a removal', () => {
    const diff = unifiedDiff('one\ntwo\n', 'one\nmid\ntwo\n', 'x.ts');

    expect(diff).toContain('+mid');
    expect(diff).not.toContain('-one');
    expect(diff).toContain('@@ -1,2 +1,3 @@');
  });

  it('marks a deleted line', () => {
    expect(unifiedDiff('one\ntwo\nthree\n', 'one\nthree\n', 'x.ts')).toContain('-two');
  });

  it('leaves untouched regions out, so a one-line change in a long file stays readable', () => {
    const before = `${Array.from({ length: 40 }, (_, index) => `line${index}`).join('\n')}\n`;
    const after = before.replace('line20', 'CHANGED');
    const diff = unifiedDiff(before, after, 'x.ts');

    expect(diff).toContain('-line20');
    expect(diff).not.toContain('line0\n');
    expect(diff.split('\n').length).toBeLessThan(14);
  });
});
