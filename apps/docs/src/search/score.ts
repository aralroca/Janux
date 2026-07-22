/**
 * Shared search scorer: the ⌘K modal (client) and the copilot's `searchDocs`
 * tool (server) rank with exactly this code. Pure TS — no DOM, no node APIs.
 */
export interface SearchHeading {
  id: string;
  text: string;
}

export interface SearchPage {
  section: string;
  slug: string;
  title: string;
  headings: SearchHeading[];
  text: string;
}

export interface SearchHit {
  section: string;
  slug: string;
  title: string;
  heading?: SearchHeading;
  snippet: string;
  score: number;
}

const TITLE_WEIGHT = 100;
const HEADING_WEIGHT = 30;
const BODY_CAP = 5;

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Score of one term on one page; 0 means the term is absent everywhere. */
function termScore(page: SearchPage, term: string): number {
  const inTitle = page.title.toLowerCase().includes(term) ? TITLE_WEIGHT : 0;
  const inHeadings = page.headings.some((h) => h.text.toLowerCase().includes(term))
    ? HEADING_WEIGHT
    : 0;
  const inBody = Math.min(occurrences(page.text.toLowerCase(), term), BODY_CAP);

  return inTitle + inHeadings + inBody;
}

/** AND semantics: every term must appear somewhere on the page. */
function pageScore(page: SearchPage, tokens: string[]): number {
  const scores = tokens.map((token) => termScore(page, token));

  return scores.includes(0) ? 0 : scores.reduce((total, score) => total + score, 0);
}

function bestHeading(page: SearchPage, tokens: string[]): SearchHeading | undefined {
  return page.headings.find((h) => tokens.some((token) => h.text.toLowerCase().includes(token)));
}

function snippet(page: SearchPage, tokens: string[]): string {
  const lower = page.text.toLowerCase();
  const at = Math.min(...tokens.map((token) => lower.indexOf(token)).filter((i) => i >= 0));
  const start = Math.max(0, (Number.isFinite(at) ? at : 0) - 40);
  const clip = page.text.slice(start, start + 160).replace(/\s+/g, ' ').trim();

  return `${start > 0 ? '…' : ''}${clip}…`;
}

function toHit(page: SearchPage, tokens: string[], score: number): SearchHit {
  const { section, slug, title } = page;

  return { section, slug, title, heading: bestHeading(page, tokens), snippet: snippet(page, tokens), score };
}

export function searchPages(pages: SearchPage[], query: string, limit = 10): SearchHit[] {
  const tokens = terms(query);

  if (tokens.length === 0) return [];

  return pages
    .map((page) => ({ page, score: pageScore(page, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page, score }) => toHit(page, tokens, score));
}
