export interface Article {
  title: string;
  body: string;
}

/** The wiki corpus: any single URL segment under /wiki names one of these. */
export const ARTICLES: Record<string, Article> = {
  'getting-started': {
    title: 'Getting started',
    body: 'Every file under src/routes is a page; this article is served by wiki/[slug].tsx.',
  },
  routing: {
    title: 'Routing',
    body: 'Static beats typed beats dynamic beats catch-all — the route-sort spec, not file order.',
  },
  islands: {
    title: 'Islands',
    body: 'The NavCounter in the header is an island: it hydrates once and survives SPA navigations.',
  },
};

/** Ticket subjects, keyed the same way the URLs are: digits or a uuid. */
export const TICKETS: Record<string, string> = {
  '123': 'Search results jump on hover',
  '2b0d7b3d-8b8f-4a1e-9d3a-1c2e4f5a6b7c': 'Prefetch cache never expires',
};
