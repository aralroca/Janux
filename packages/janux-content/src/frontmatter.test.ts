import { describe, expect, it } from 'bun:test';
import { int, list, schema, str } from 'janux';
import { parseFrontmatter, splitFrontmatter, validateFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
  it('separates a leading --- block from the body', () => {
    const { yaml, body } = splitFrontmatter('---\ntitle: Hi\n---\n# Heading\n\nProse.\n');

    expect(yaml).toBe('title: Hi');
    expect(body).toBe('# Heading\n\nProse.\n');
  });

  it('leaves a file with no frontmatter entirely as body', () => {
    const { yaml, body } = splitFrontmatter('# Heading\n\nProse.\n');

    expect(yaml).toBeUndefined();
    expect(body).toBe('# Heading\n\nProse.\n');
  });

  /** A `---` mid-document is a thematic break; only column 0 of line 1 opens frontmatter. */
  it('ignores a --- that is not the first line', () => {
    const source = '# Heading\n\n---\n\nProse.\n';

    expect(splitFrontmatter(source)).toEqual({ yaml: undefined, body: source });
  });

  it('handles CRLF line endings', () => {
    const { yaml, body } = splitFrontmatter('---\r\ntitle: Hi\r\n---\r\n# Heading\r\n');

    expect(yaml).toBe('title: Hi');
    expect(body).toBe('# Heading\r\n');
  });

  it('accepts an empty frontmatter block', () => {
    expect(splitFrontmatter('---\n---\nBody\n')).toEqual({ yaml: '', body: 'Body\n' });
  });

  /** Otherwise every body starts with the blank line the author left after `---`. */
  it('drops the blank lines between the block and the body', () => {
    expect(splitFrontmatter('---\ntitle: Hi\n---\n\n\n# Heading\n').body).toBe('# Heading\n');
  });

  /** A `---` inside the body is content, not a second block. */
  it('closes on the first --- and keeps the rest verbatim', () => {
    const { yaml, body } = splitFrontmatter('---\ntitle: Hi\n---\nOne\n\n---\n\nTwo\n');

    expect(yaml).toBe('title: Hi');
    expect(body).toBe('One\n\n---\n\nTwo\n');
  });

  /** An unterminated block is a typo, and silently treating it as body hides it. */
  it('refuses an unterminated block', () => {
    expect(() => splitFrontmatter('---\ntitle: Hi\n\n# Heading\n')).toThrow(/unterminated/i);
  });
});

describe('parseFrontmatter', () => {
  it('reads scalars as their YAML types', () => {
    const { data } = parseFrontmatter('---\ntitle: Hi\ncount: 3\nratio: 1.5\ndraft: true\n---\nBody\n');

    expect(data).toEqual({ title: 'Hi', count: 3, ratio: 1.5, draft: true });
  });

  /**
   * The schema layer has no date kind, so a date must arrive as the ISO string
   * the author wrote. YAML 1.1's timestamp tag would hand over a `Date` that
   * `str()` then rejects — the core schema is what keeps the two in step.
   */
  it('leaves an ISO date as a string', () => {
    const { data } = parseFrontmatter('---\ndate: 2026-07-01\n---\n');

    expect(data.date).toBe('2026-07-01');
  });

  it('reads inline and block sequences as arrays', () => {
    const inline = parseFrontmatter('---\ntags: [a, b]\n---\n').data;
    const block = parseFrontmatter('---\ntags:\n  - a\n  - b\n---\n').data;

    expect(inline.tags).toEqual(['a', 'b']);
    expect(block.tags).toEqual(['a', 'b']);
  });

  it('reads nested maps as objects', () => {
    const { data } = parseFrontmatter('---\nauthor:\n  name: Aral\n  age: 39\n---\n');

    expect(data.author).toEqual({ name: 'Aral', age: 39 });
  });

  it('reads a quoted value containing a colon', () => {
    expect(parseFrontmatter('---\ntitle: "Schema: the contract"\n---\n').data.title).toBe('Schema: the contract');
  });

  it('gives an empty object when there is no frontmatter', () => {
    expect(parseFrontmatter('# Heading\n')).toEqual({ data: {}, body: '# Heading\n' });
  });

  it('rejects a frontmatter block that is not a map', () => {
    expect(() => parseFrontmatter('---\n- a\n- b\n---\n')).toThrow(/map/i);
  });

  /**
   * A YAML error is almost always an unquoted colon, and the parser's own
   * message says which column — not which of eighty-five files.
   */
  it('names the file when the YAML itself does not parse', () => {
    const source = '---\ndescription: Everything importable: the lot\n---\n# Hi\n';

    expect(() => parseFrontmatter(source, 'content/api.md')).toThrow(/content\/api\.md/);
    expect(() => parseFrontmatter(source, 'content/api.md')).toThrow(/Nested mappings/);
  });
});

describe('validateFrontmatter', () => {
  const post = schema({ title: str(), order: int().optional(), tags: list(str()).default([]) });

  it('returns the validated value, defaults applied', () => {
    expect(validateFrontmatter(post, { title: 'Hi' }, 'content/hi.md')).toEqual({
      title: 'Hi',
      order: undefined,
      tags: [],
    });
  });

  /** The same `validate()` the component state and intent inputs go through. */
  it('names the file and every failing field', () => {
    expect(() => validateFrontmatter(post, { order: 'x' }, 'content/hi.md')).toThrow(
      /content\/hi\.md[\s\S]*title: required[\s\S]*order: expected int/,
    );
  });

  it('strips keys the schema does not declare', () => {
    expect(validateFrontmatter(post, { title: 'Hi', extra: 1 }, 'f.md')).not.toHaveProperty('extra');
  });
});
