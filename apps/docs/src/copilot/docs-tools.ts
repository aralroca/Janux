import { defineTool } from '@janux/agent/local';
import { searchPages, type SearchHit, type SearchPage } from '../search/score';

let corpus: Promise<SearchPage[]> | undefined;
let registered = false;

const MAX_HITS = 5;
const MAX_CHARS = 6000;

/** Same static index the ⌘K modal uses — works on `output: "static"` deploys too. */
function loadCorpus(): Promise<SearchPage[]> {
  corpus ??= fetch('/search-index.json').then((response) => response.json());

  return corpus;
}

export interface DocMatch {
  title: string;
  snippet: string;
  path: string;
}

/** Question words that defeat the ⌘K scorer's AND semantics. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'can', 'do', 'does', 'for', 'how', 'i', 'in', 'is', 'it',
  'my', 'of', 'on', 'or', 'the', 'to', 'use', 'using', 'what', 'with', 'you',
]);

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOPWORDS.has(term));
}

/** OR fallback: per-term hits merged by summed score, for when the AND query is too strict. */
function mergePerTerm(pages: SearchPage[], terms: string[]): SearchHit[] {
  const byPage = new Map<string, SearchHit>();

  terms
    .flatMap((term) => searchPages(pages, term, MAX_HITS))
    .forEach((hit) => {
      const key = `${hit.section}/${hit.slug}`;
      const seen = byPage.get(key);

      byPage.set(key, seen ? { ...seen, score: seen.score + hit.score } : hit);
    });

  return [...byPage.values()].sort((a, b) => b.score - a.score).slice(0, MAX_HITS);
}

/** Shared by the `search_docs` tool and the controller's pre-seeded search. */
export async function searchMatches(query: string): Promise<DocMatch[]> {
  const pages = await loadCorpus();
  const terms = keywords(query);
  const direct = searchPages(pages, terms.join(' '), MAX_HITS);
  const hits = direct.length > 0 ? direct : mergePerTerm(pages, terms);

  return hits.map(({ section, slug, title, snippet }) => ({
    title,
    snippet,
    path: `/docs/${section}/${slug}`,
  }));
}

async function search({ query }: { query: string }): Promise<unknown> {
  return { matches: await searchMatches(query) };
}

export interface DocPage {
  title: string;
  path: string;
  text: string;
}

/** Shared by the `read_doc` tool and the controller's pre-read of the top match. */
export async function readPage(path: string, maxChars = MAX_CHARS): Promise<DocPage | undefined> {
  const pages = await loadCorpus();
  const page = pages.find((entry) => `/docs/${entry.section}/${entry.slug}` === path);

  if (!page) return undefined;

  return { title: page.title, path, text: page.text.slice(0, maxChars) };
}

async function read({ path }: { path: string }): Promise<unknown> {
  const page = await readPage(path);

  return page ?? { error: `Unknown doc "${path}". Use search_docs to find valid paths.` };
}

/** The copilot's grounding tools: search + read over the full docs corpus, fully client-side. */
export function registerDocsTools(): void {
  if (registered) return;
  registered = true;
  defineTool({
    name: 'search_docs',
    description: 'Search the Janux documentation. Returns ranked pages with title, snippet and path.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
    execute: search,
  });
  defineTool({
    name: 'read_doc',
    description: 'Read the full text of one documentation page by its path (e.g. /docs/guide/components).',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    annotations: { readOnlyHint: true },
    execute: read,
  });
}
