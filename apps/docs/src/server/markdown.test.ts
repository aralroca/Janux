import { describe, expect, test } from 'bun:test';
import { docContent, docIndex } from './docs.api';
import { renderMarkdown, summarize } from './markdown';

describe('renderMarkdown', () => {
  test('TOC entries decode HTML entities and strip inline tags', async () => {
    const { toc } = await renderMarkdown('# Title\n\n## Requirements & gotchas\n\n## The `code` case');

    expect(toc.map((entry) => entry.text)).toEqual(['Requirements & gotchas', 'The code case']);
    expect(toc.map((entry) => entry.id)).toEqual(['requirements-gotchas', 'the-code-case']);
  });

  test('headings render ids and anchors', async () => {
    const { html } = await renderMarkdown('## Ship & deploy');

    expect(html).toContain('<h2 id="ship-deploy">');
    expect(html).toContain('href="#ship-deploy"');
  });
});

describe('summarize', () => {
  test('takes the first prose paragraph as plain text, links and ticks stripped', () => {
    const markdown = '# Title\n\nSee the [guide](/docs/guide) for `component()` and **more**.\n\nSecond paragraph.';

    expect(summarize(markdown)).toBe('See the guide for component() and more.');
  });

  /** The glossary opens in bold; treating that as a list left the page with no description. */
  test('a paragraph opening in bold is prose, not a list item', () => {
    expect(summarize('# Glossary\n\n**Bifacial component** — one definition, two faces.')).toBe(
      'Bifacial component — one definition, two faces.',
    );
  });

  test('skips headings, callouts, fences, tables and real lists', () => {
    const markdown = '# Title\n\n> A callout.\n\n```ts\nconst a = 1;\n```\n\n| a | b |\n\n- item\n\n1. step\n\nThe prose.';

    expect(summarize(markdown)).toBe('The prose.');
  });

  test('truncates on a word boundary with an ellipsis', () => {
    const summary = summarize(`# T\n\n${'word '.repeat(60)}`)!;

    expect(summary.length).toBeLessThanOrEqual(156);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).not.toContain('wor…');
  });

  test('returns nothing when there is no prose to summarize', () => {
    expect(summarize('# Only a heading')).toBeUndefined();
  });

  /**
   * A fence with a blank line inside splits into several blank-line-separated
   * blocks, and only the first one starts with ```. Seven reference pages shipped
   * a line of their own example code as the page description that way.
   */
  test('never takes prose from inside a code fence, blank lines included', () => {
    const markdown = [
      '# Signal',
      '',
      '```ts',
      'const count = signal(0);',
      '',
      'count.value += 1;',
      '```',
      '',
      'A signal is a reactive value.',
    ].join('\n');

    expect(summarize(markdown)).toBe('A signal is a reactive value.');
  });
});

/**
 * The whole corpus, not a fixture: a description is the one piece of text on a
 * page that nobody reads while writing it, so nothing else would catch a page
 * describing itself with a line of code.
 */
describe('every doc page summarizes to prose', () => {
  const descriptions = docIndex().map(({ section, slug }) => ({
    path: `/docs/${section}/${slug}`,
    text: summarize(docContent(section, slug) ?? ''),
  }));

  test('every page has one', () => {
    expect(descriptions.filter(({ text }) => !text).map(({ path }) => path)).toEqual([]);
  });

  /**
   * Reads as a sentence, so it can't be a line lifted out of a snippet. Prose
   * mentioning code is fine — `bun create janux writes all of this for you.`
   * is a sentence; `const count = signal(0);` is not.
   */
  test('every one of them reads as a sentence', () => {
    const notSentences = descriptions.filter(({ text }) => text && !/[.!?…:]$/.test(text));

    expect(notSentences.map(({ path, text }) => `${path}: ${text}`)).toEqual([]);
  });
});
