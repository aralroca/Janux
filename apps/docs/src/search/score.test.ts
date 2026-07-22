import { describe, expect, test } from 'bun:test';
import { searchPages, type SearchPage } from './score';

const page = (over: Partial<SearchPage>): SearchPage => ({
  section: 'guide',
  slug: 'a',
  title: 'A',
  headings: [],
  text: '',
  ...over,
});

const PAGES: SearchPage[] = [
  page({ slug: 'guards', title: 'Intents and guards', text: 'guard check pipeline', headings: [{ id: 'guards-hil', text: 'Guards and HIL' }] }),
  page({ slug: 'stores', title: 'Stores', text: 'shared state, no guard here once' }),
  page({ slug: 'schema', title: 'Schema', text: 'types and validation' }),
];

describe('searchPages', () => {
  test('ranks title matches above heading matches above body matches', () => {
    const hits = searchPages(PAGES, 'guard');

    expect(hits.map((hit) => hit.slug)).toEqual(['guards', 'stores']);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  test('AND semantics: every term must appear', () => {
    expect(searchPages(PAGES, 'guard validation')).toHaveLength(0);
    expect(searchPages(PAGES, 'guard pipeline')).toHaveLength(1);
  });

  test('returns the best matching heading as anchor', () => {
    const [hit] = searchPages(PAGES, 'guard');

    expect(hit!.heading).toEqual({ id: 'guards-hil', text: 'Guards and HIL' });
  });

  test('builds a snippet around the first match', () => {
    const [hit] = searchPages(PAGES, 'pipeline');

    expect(hit!.snippet).toContain('pipeline');
  });

  test('empty and whitespace-only queries return nothing', () => {
    expect(searchPages(PAGES, '')).toHaveLength(0);
    expect(searchPages(PAGES, '   ')).toHaveLength(0);
  });

  test('respects the limit', () => {
    expect(searchPages(PAGES, 'guard', 1)).toHaveLength(1);
  });
});
