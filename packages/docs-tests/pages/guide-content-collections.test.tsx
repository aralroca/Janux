import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineCollection, getCollection, getEntry, parseFrontmatter, render, slugify, splitFrontmatter, validateFrontmatter } from '@janux/content';
import { bool, component, list, schema, str } from 'janux';
import { renderToString } from 'janux/server';

/**
 * guide/content-collections.md and reference/content-api.md — the documented
 * collection is built for real, from files on disk, and the claims about typed
 * frontmatter, MDX components and heading ids are executed rather than read.
 */

let root: string;

/** The collection the guide declares, over the content the guide describes. */
function notes() {
  return defineCollection({
    dir: join(root, 'content/notes'),
    schema: schema({
      title: str(),
      date: str(),
      summary: str(),
      tags: list(str()).default([]),
      draft: bool().default(false),
    }),
  });
}

const Poll = component({
  name: 'poll',
  state: schema({ question: str().default('Which one?') }),
  view: ({ state }) => `${state.question}`,
});

function write(name: string, source: string): void {
  const path = join(root, 'content/notes', name);

  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, source);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'janux-content-docs-'));
  write(
    'hello-world.md',
    '---\ntitle: Hello\ndate: 2026-07-01\nsummary: The first note.\ntags: [intro]\n---\n\n# Hello\n\n## One schema\n\nUse { braces } freely.\n',
  );
  write('draft.md', '---\ntitle: Draft\ndate: 2026-07-09\nsummary: Not yet.\ndraft: true\n---\n\n# Draft\n');
  write(
    'interactive.mdx',
    "---\ntitle: An island written inside a note\ndate: 2026-07-02\nsummary: MDX embeds a real island.\n---\n\n<Poll initial={{ question: 'Which part sold you?' }} />\n",
  );
  write('nested/deep.md', '---\ntitle: Deep\ndate: 2026-07-03\nsummary: Nested.\n---\n\n# Deep\n');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function html(node: unknown): Promise<string> {
  const result = await renderToString(node as any);

  return typeof result === 'string' ? result : (result as { html: string }).html;
}

describe('guide/content-collections.md — declaring and reading a collection', () => {
  it('reads every content file, ordered by id, with the format recorded', () => {
    expect(getCollection(notes()).map((note) => [note.id, note.format])).toEqual([
      ['draft', 'md'],
      ['hello-world', 'md'],
      ['interactive', 'mdx'],
      ['nested/deep', 'md'],
    ]);
  });

  it('filters declaratively on validated data, and defaults are applied', () => {
    const published = getCollection(notes(), (note) => !note.data.draft);

    expect(published.map((note) => note.id)).toEqual(['hello-world', 'interactive', 'nested/deep']);
    expect(published[0]!.data.tags).toEqual(['intro']);
    expect(published[1]!.data.tags).toEqual([]);
  });

  it('feeds staticParams straight from the collection', () => {
    const staticParams = () => getCollection(notes()).map((note) => ({ slug: note.id }));

    expect(staticParams()).toContainEqual({ slug: 'nested/deep' });
  });

  it('exposes body without the frontmatter block, and the source file path', () => {
    const note = getEntry(notes(), 'hello-world')!;

    expect(note.body.startsWith('# Hello')).toBe(true);
    expect(note.file).toBe(join(root, 'content/notes/hello-world.md'));
  });

  it('fails the build naming the file and the field', () => {
    write('broken.md', '---\ndate: 2026-07-01\nsummary: No title.\n---\n\n# Broken\n');

    expect(() => getCollection(notes())).toThrow(/broken\.md[\s\S]*title: required/);
    rmSync(join(root, 'content/notes/broken.md'));
  });

  it('keeps an ISO date a string, as the schema promises', () => {
    expect(getEntry(notes(), 'hello-world')!.data.date).toBe('2026-07-01');
  });

  it('matches ids rather than joining them onto a path', () => {
    expect(getEntry(notes(), '../../etc/passwd')).toBeUndefined();
  });
});

describe('guide/content-collections.md — rendering', () => {
  it('renders a body and collects headings whose ids are on the elements', async () => {
    const { Content, headings } = await render(getEntry(notes(), 'hello-world')!);

    expect(headings).toEqual([
      { depth: 1, id: 'hello', text: 'Hello' },
      { depth: 2, id: 'one-schema', text: 'One schema' },
    ]);
    expect(await html(<Content />)).toContain('id="one-schema"');
  });

  it('leaves braces alone in a .md body', async () => {
    const { Content } = await render(getEntry(notes(), 'hello-world')!);

    expect(await html(<Content />)).toContain('{ braces }');
  });

  it('mounts a component named by an .mdx body as a real island', async () => {
    const { Content } = await render(getEntry(notes(), 'interactive')!, { components: { Poll } });
    const output = await html(<Content />);

    expect(output).toContain('janux-island');
    expect(output).toContain('Which part sold you?');
  });

  it('overrides an element with the app’s own component', async () => {
    const { Content } = await render(getEntry(notes(), 'hello-world')!, {
      components: { h2: (props: any) => <h2 class="doc-heading">{props.children}</h2> },
    });

    expect(await html(<Content />)).toContain('class="doc-heading"');
  });
});

describe('reference/content-api.md — the frontmatter primitives', () => {
  it('splitFrontmatter separates the block from the body', () => {
    expect(splitFrontmatter('---\ntitle: Hi\n---\n# Hi\n')).toEqual({ yaml: 'title: Hi', body: '# Hi\n' });
  });

  it('splitFrontmatter refuses an unterminated block', () => {
    expect(() => splitFrontmatter('---\ntitle: Hi\n\n# Hi\n')).toThrow(/unterminated/i);
  });

  it('parseFrontmatter reads YAML core types and keeps a date as a string', () => {
    expect(parseFrontmatter('---\ntitle: Hi\ndraft: true\ndate: 2026-07-01\n---\n# Hi\n').data).toEqual({
      title: 'Hi',
      draft: true,
      date: '2026-07-01',
    });
  });

  it('validateFrontmatter returns the typed value and names the file when it fails', () => {
    const type = schema({ title: str() });

    expect(validateFrontmatter(type, { title: 'Hi' }, 'content/hi.md')).toEqual({ title: 'Hi' });
    expect(() => validateFrontmatter(type, {}, 'content/hi.md')).toThrow(/content\/hi\.md[\s\S]*title: required/);
  });

  it('slugify produces the id render stamps on a heading', () => {
    expect(slugify('Deep, with punctuation!')).toBe('deep-with-punctuation');
  });
});
