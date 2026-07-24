import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UNTESTED_PAGES } from './untested-pages';

/**
 * Second axis of docs truth: every page that makes an executable claim must
 * have a test that RUNS it. Compiling proves the snippet parses; only running
 * proves the prose. Tests declare what they cover by naming the page in a
 * describe title (e.g. `describe('reference/signal.md', …)`), so coverage is
 * readable in the test file itself.
 */

const ROOT = resolve(import.meta.dir, '../..');
const CONTENT = join(ROOT, 'apps/docs/content');

function pages(): string[] {
  return readdirSync(CONTENT, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replaceAll('\\', '/'));
}

/** A page makes an executable claim when a snippet imports the framework. */
function hasRunnableExample(page: string): boolean {
  const markdown = readFileSync(join(CONTENT, page), 'utf8');

  return [...markdown.matchAll(/```(?:tsx?|jsx?)(?:[ \t]+[^\n]*)?\n([\s\S]*?)```/g)].some((match) =>
    /^import\s[^\n]*from '(janux|@janux\/)/m.test(match[1]!),
  );
}

function testSources(): string {
  const dir = join(import.meta.dir, 'pages');

  return readdirSync(dir)
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

const runnable = pages().filter(hasRunnableExample);
// Only names that are real pages count: a test hitting `http://test/pricing.md`
// mentions the pattern without covering anything.
const covered = new Set(
  [...testSources().matchAll(/([a-z0-9-]+\/[a-z0-9-]+\.md)/g)].map((match) => match[1]!).filter((name) => pages().includes(name)),
);

describe('every page with executable claims has a test that runs them', () => {
  it('no runnable page is silently untested', () => {
    const missing = runnable.filter((page) => !covered.has(page) && !UNTESTED_PAGES.includes(page));

    expect(missing).toEqual([]);
  });

  it('the backlog lists only real, still-untested pages', () => {
    const stale = UNTESTED_PAGES.filter((page) => !runnable.includes(page) || covered.has(page));

    expect(stale).toEqual([]);
  });

  /**
   * This used to assert `runnable > covered` as a "we haven't covered everything
   * yet" sanity check. Coverage overtook it, which is the point — the invariant
   * worth guarding is that the corpus really has executable claims and that
   * tests really name pages, so the two lists above can't both be vacuous.
   */
  it('the corpus has executable claims and the tests name real pages', () => {
    expect(runnable.length).toBeGreaterThan(20);
    expect(covered.size).toBeGreaterThan(20);
    expect([...covered].every((page) => pages().includes(page))).toBe(true);
  });
});
