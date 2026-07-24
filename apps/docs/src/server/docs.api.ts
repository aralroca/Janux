import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api } from '@janux/server';
import { schema, str, list } from 'janux';
import { searchPages, type SearchPage } from '../search/score';
import { slugify } from './markdown';

const CONTENT_DIR = join(import.meta.dirname, '../../content');

export interface SectionGroup {
  label?: string;
  slugs: string[];
}

export interface SectionDef {
  section: string;
  label: string;
  groups: SectionGroup[];
}

/**
 * Ordered sections → ordered groups → ordered slugs. The single source of
 * truth for nav, breadcrumbs, prev/next, search and llms.txt. Groups are
 * purely presentational (sidebar headings): URLs stay /docs/<section>/<slug>.
 */
export const SECTIONS: SectionDef[] = [
  {
    section: 'guide',
    label: 'Guide',
    groups: [
      { slugs: ['getting-started'] },
      {
        label: 'Components & state',
        slugs: [
          'components',
          'schema',
          'intents-and-guards',
          'sources-effects-events',
          'events-and-interactions',
          'stores',
          'data-cache',
          'interop',
        ],
      },
      { label: 'Rendering & navigation', slugs: ['ssr-and-resumability', 'navigation', 'i18n'] },
      { label: 'Server & agents', slugs: ['api-rpc', 'http-handlers', 'agent-and-copilot'] },
      { label: 'Shipping', slugs: ['cli-and-deployment', 'architecture-and-roadmap'] },
    ],
  },
  {
    section: 'tutorial',
    label: 'Tutorial',
    groups: [{ slugs: ['tasks-app-part-1', 'tasks-app-part-2', 'tasks-app-part-3'] }],
  },
  {
    section: 'reference',
    label: 'Reference',
    groups: [
      { label: 'Packages', slugs: ['core-api', 'schema-api', 'server-api', 'agent-api'] },
      { label: 'Client & CLI', slugs: ['client-api', 'cli'] },
    ],
  },
  {
    section: 'recipes',
    label: 'Recipes',
    groups: [
      {
        slugs: [
          'testing-components',
          'tailwind',
          'auth-and-context',
          'cross-island-events',
          'deploying',
          'external-mcp-clients',
          'local-model-copilot',
          'debugging-webmcp',
        ],
      },
    ],
  },
  { section: 'more', label: 'More', groups: [{ slugs: ['examples', 'comparison', 'faq', 'glossary'] }] },
];

export interface DocRef {
  section: string;
  slug: string;
  path: string;
  title: string;
}

export function sectionSlugs(section: string): string[] {
  const def = SECTIONS.find((entry) => entry.section === section);

  return def?.groups.flatMap((group) => group.slugs) ?? [];
}

export function sectionLabel(section: string): string {
  return SECTIONS.find((entry) => entry.section === section)?.label ?? section;
}

/** Label of the sidebar group containing a slug, for breadcrumbs. */
export function groupLabel(section: string, slug: string): string | undefined {
  const def = SECTIONS.find((entry) => entry.section === section);

  return def?.groups.find((group) => group.slugs.includes(slug))?.label;
}

export function docContent(section: string, slug: string): string | undefined {
  if (!/^[a-z0-9-]+$/.test(section) || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  if (!sectionSlugs(section).includes(slug)) return undefined;
  try {
    return readFileSync(join(CONTENT_DIR, section, `${slug}.md`), 'utf-8');
  } catch {
    return undefined;
  }
}

function titleOf(section: string, slug: string): string {
  return docContent(section, slug)?.match(/^# (.+)$/m)?.[1] ?? slug;
}

/** Flat ordered index of every existing doc — drives sidebar, prev/next and search. */
export function docIndex(): DocRef[] {
  return SECTIONS.flatMap(({ section }) =>
    sectionSlugs(section)
      .filter((slug) => docContent(section, slug) !== undefined)
      .map((slug) => ({
        section,
        slug,
        path: `/docs/${section}/${slug}`,
        title: titleOf(section, slug),
      })),
  );
}

function headingsOf(markdown: string): { id: string; text: string }[] {
  return [...markdown.matchAll(/^#{2,3} (.+)$/gm)].map(([, text]) => ({
    id: slugify(text ?? ''),
    text: text ?? '',
  }));
}

function plainText(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6} /gm, '')
    .replace(/[*_]/g, '');
}

/** The pages the shared scorer runs over — also serialized to search-index.json at build. */
export function searchCorpus(): SearchPage[] {
  return docIndex().map(({ section, slug, title }) => {
    const markdown = docContent(section, slug) ?? '';

    return { section, slug, title, headings: headingsOf(markdown), text: plainText(markdown) };
  });
}

export const listDocs = api({
  description: 'List all documentation pages (section, slug, title)',
  output: schema({ docs: list({ section: str(), slug: str(), title: str() }) }),
  run: () => ({ docs: docIndex().map(({ section, slug, title }) => ({ section, slug, title })) }),
});

export const readDoc = api({
  description: 'Read one documentation page as markdown, by section and slug',
  input: schema({ section: str(), slug: str() }),
  run: ({ input }) => ({ markdown: docContent(input.section, input.slug) ?? 'Not found' }),
});

export const searchDocs = api({
  description: 'Full-text search across the documentation. Returns ranked pages with a snippet.',
  input: schema({ query: str().min(2) }),
  run: ({ input }) => ({
    matches: searchPages(searchCorpus(), input.query).map((hit) => ({
      section: hit.section,
      slug: hit.slug,
      title: hit.title,
      snippet: hit.snippet,
    })),
  }),
});
