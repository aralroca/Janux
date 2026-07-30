import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SECTIONS, docIndex, docContent, groupLabel, sectionLabel, searchCorpus } from './docs.api';

const CONTENT_DIR = join(import.meta.dirname, '../../content');

const allSlugs = SECTIONS.flatMap(({ section, groups }) =>
  groups.flatMap((group) => group.slugs.map((slug) => `${section}/${slug}`)),
);

describe('SECTIONS integrity', () => {
  test('every content file appears in exactly one group', () => {
    const files = SECTIONS.flatMap(({ section }) =>
      readdirSync(join(CONTENT_DIR, section))
        .filter((file) => file.endsWith('.md'))
        .map((file) => `${section}/${file.replace(/\.md$/, '')}`),
    );

    expect([...allSlugs].sort()).toEqual([...files].sort());
  });

  test('no slug is listed twice', () => {
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
  });

  test('docIndex covers every listed slug, in SECTIONS order', () => {
    expect(docIndex().map(({ section, slug }) => `${section}/${slug}`)).toEqual(allSlugs);
  });

  test('every doc has an H1 title', () => {
    for (const { section, slug, title } of docIndex()) {
      expect(docContent(section, slug)).toBeDefined();
      expect(title).not.toBe(slug);
    }
  });
});

describe('the docs collection', () => {
  /**
   * Titles and descriptions used to be guessed from the body — an H1 regex and
   * a first-paragraph heuristic. They are frontmatter now, so the schema is
   * what fails when a page forgets one, at build time and by name.
   */
  test('every page declares a title and a description', () => {
    const missing = docIndex().filter((doc) => !doc.title.trim() || !doc.description?.trim());

    expect(missing).toEqual([]);
  });

  /** Two places can say the title; only one can be right, so they must agree. */
  test('the frontmatter title is the H1 the page renders', () => {
    const drifted = docIndex()
      .map((doc) => ({ page: `${doc.section}/${doc.slug}`, ...doc, h1: docContent(doc.section, doc.slug)?.match(/^# (.+)$/m)?.[1] }))
      .filter((doc) => doc.h1 !== doc.title)
      .map((doc) => `${doc.page}: "${doc.title}" vs "${doc.h1}"`);

    expect(drifted).toEqual([]);
  });

  /** The body a page renders, a projection serves and the search corpus indexes. */
  test('docContent returns the body without the frontmatter block', () => {
    const body = docContent('guide', 'schema')!;

    expect(body.startsWith('---')).toBe(false);
    expect(body.startsWith('# ')).toBe(true);
  });

  test('a section or slug outside the nav is not readable', () => {
    expect(docContent('guide', 'nope')).toBeUndefined();
    expect(docContent('../guide', 'schema')).toBeUndefined();
  });

  test('labels resolve', () => {
    expect(sectionLabel('guide')).toBe('Guide');
    expect(groupLabel('guide', 'intents-and-guards')).toBe('Components & state');
    expect(groupLabel('more', 'faq')).toBeUndefined();
  });
});

describe('searchCorpus', () => {
  test('serializes one entry per doc with headings and plain text', () => {
    const corpus = searchCorpus();

    expect(corpus).toHaveLength(docIndex().length);
    const guards = corpus.find((entry) => entry.slug === 'intents-and-guards')!;

    expect(guards.headings.length).toBeGreaterThan(0);
    expect(guards.headings[0]!.id).toMatch(/^[a-z0-9-]+$/);
    expect(guards.text).not.toContain('```');
  });
});
