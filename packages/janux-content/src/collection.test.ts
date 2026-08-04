import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bool, list, schema, str } from 'janux';
import { defineCollection, getCollection, getEntry } from './collection';

const FIXTURES = join(import.meta.dir, '__fixtures__');
const POST = schema({ title: str(), date: str(), tags: list(str()).default([]), draft: bool().default(false) });

const posts = defineCollection({ dir: join(FIXTURES, 'content/posts'), schema: POST });

describe('defineCollection + getCollection', () => {
  it('reads every content file in the directory, ordered by id', () => {
    expect(getCollection(posts).map((entry) => entry.id)).toEqual(['hello', 'interactive', 'nested/deep']);
  });

  it('validates the frontmatter with the collection schema, defaults applied', () => {
    const [hello] = getCollection(posts);

    expect(hello!.data).toEqual({ title: 'Hello', date: '2026-07-01', tags: ['intro', 'janux'], draft: false });
  });

  it('exposes the body without the frontmatter block', () => {
    expect(getCollection(posts)[0]!.body).toBe('# Hello\n\nFirst post.\n');
  });

  it('records the format so a renderer knows whether components are allowed', () => {
    const formats = Object.fromEntries(getCollection(posts).map((entry) => [entry.id, entry.format]));

    expect(formats).toEqual({ hello: 'md', interactive: 'mdx', 'nested/deep': 'md' });
  });

  /** Ids are URL-shaped: the path inside the collection, extension dropped, POSIX separators. */
  it('gives a nested file a nested id', () => {
    expect(getEntry(posts, 'nested/deep')?.data.title).toBe('Deep');
  });

  it('ignores files that are not markdown', () => {
    expect(getCollection(posts).some((entry) => entry.id.includes('notes'))).toBe(false);
  });

  it('filters declaratively', () => {
    expect(getCollection(posts, (entry) => entry.data.date > '2026-07-01').map((entry) => entry.id)).toEqual([
      'interactive',
      'nested/deep',
    ]);
  });

  it('gives the absolute source path, so an error can point at the file', () => {
    expect(getEntry(posts, 'hello')?.file).toBe(join(FIXTURES, 'content/posts/hello.md'));
  });

  it('fails loudly, naming the file, when the frontmatter does not match', () => {
    const broken = defineCollection({ dir: join(FIXTURES, 'content/broken'), schema: POST });

    expect(() => getCollection(broken)).toThrow(/missing-title\.md[\s\S]*title: required/);
  });

  it('is empty, not an error, when the directory does not exist', () => {
    expect(getCollection(defineCollection({ dir: join(FIXTURES, 'nope'), schema: POST }))).toEqual([]);
  });
});

describe('getEntry', () => {
  it('finds an entry by id', () => {
    expect(getEntry(posts, 'hello')?.data.title).toBe('Hello');
  });

  it('returns undefined for an id nothing answers to', () => {
    expect(getEntry(posts, 'ghost')).toBeUndefined();
  });

  /** The id comes from a URL; it must not be able to walk out of the collection. */
  it('refuses to escape the collection directory', () => {
    expect(getEntry(posts, '../broken/missing-title')).toBeUndefined();
  });
});

describe('relative directories', () => {
  const previous = process.env.JANUX_APP_ROOT;

  afterEach(() => {
    if (previous === undefined) delete process.env.JANUX_APP_ROOT;
    else process.env.JANUX_APP_ROOT = previous;
  });

  /**
   * The app root, not the working directory: a bundled deployment runs its
   * server from somewhere else entirely, and `JANUX_APP_ROOT` is the convention
   * that already tells it where the app's files landed.
   */
  it('resolves a relative dir against JANUX_APP_ROOT', () => {
    process.env.JANUX_APP_ROOT = FIXTURES;
    const relative = defineCollection({ dir: 'content/posts', schema: POST });

    expect(getCollection(relative).map((entry) => entry.id)).toEqual(['hello', 'interactive', 'nested/deep']);
  });
});

describe('caching', () => {
  /** Seconds since the epoch, whole — see the same-tick case below. */
  const PINNED = 1_600_000_000;
  const dir = join(FIXTURES, '.tmp-cache');
  const file = join(dir, 'note.md');
  const notes = defineCollection({ dir, schema: schema({ title: str() }) });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Dev edits a file and reloads; a cache keyed only by path would serve the old one. */
  it('picks up an edit to a file it already read', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, '---\ntitle: Before\n---\nBody\n');
    expect(getEntry(notes, 'note')?.data.title).toBe('Before');

    writeFileSync(file, '---\ntitle: After\n---\nBody\n');
    expect(getEntry(notes, 'note')?.data.title).toBe('After');
  });

  /**
   * Two edits inside one mtime tick. How coarse that tick is depends on the
   * runtime: Bun 1.3.0 — the floor `engines` declares — reports whole
   * milliseconds where later versions report fractions, so a real edit went
   * unseen there and the suite only caught it on that lane. The timestamp is
   * restored here rather than raced, so the window is reproduced on any clock.
   */
  it('picks up an edit that lands within one mtime tick', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, '---\ntitle: Before\n---\nBody\n');
    // A whole second, stamped on both writes: it round-trips exactly at any
    // clock resolution, where restoring a captured timestamp does not.
    utimesSync(file, PINNED, PINNED);

    expect(getEntry(notes, 'note')?.data.title).toBe('Before');

    writeFileSync(file, '---\ntitle: After\n---\nBody\n');
    utimesSync(file, PINNED, PINNED);

    // Without this the file would look edited for the ordinary reason.
    expect(statSync(file).mtimeMs).toBe(PINNED * 1000);
    expect(getEntry(notes, 'note')?.data.title).toBe('After');
  });
});

describe('two collections over one directory', () => {
  /**
   * `data` is the *validated* value, so a cache shared by path alone hands the
   * second collection the first one's shape — silently, and only when the two
   * happen to run in the same process.
   */
  it('each validates through its own schema', () => {
    const titlesOnly = defineCollection({ dir: join(FIXTURES, 'content/posts'), schema: schema({ title: str() }) });

    expect(getEntry(titlesOnly, 'hello')!.data).toEqual({ title: 'Hello' });
    expect(getEntry(posts, 'hello')!.data.tags).toEqual(['intro', 'janux']);
  });
});

describe('duplicate ids', () => {
  const dir = join(FIXTURES, '.tmp-dupe');

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** `a.md` and `a.mdx` answer to the same URL; picking one silently is a coin toss. */
  it('refuses two files that resolve to the same id', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.md'), '---\ntitle: One\n---\n');
    writeFileSync(join(dir, 'a.mdx'), '---\ntitle: Two\n---\n');

    expect(() => getCollection(defineCollection({ dir, schema: schema({ title: str() }) }))).toThrow(/duplicate/i);
  });
});
