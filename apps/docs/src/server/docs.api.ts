import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api } from '@janux/server';
import { schema, str, list } from 'janux';
import { searchPages, type SearchPage } from '../search/score';
import { slugify, stripMarkdown } from './markdown';

/**
 * The pages are files on disk, so this has to hold wherever the module ends up.
 * `import.meta.dirname` is this file's directory when Bun runs the source, and
 * the *bundle's* directory once a deployment adapter has bundled the server —
 * which is why one of them publishes the app root before importing the app.
 */
const CONTENT_DIR = join(process.env.JANUX_APP_ROOT ?? join(import.meta.dirname, '../..'), 'content');

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
    section: 'getting-started',
    label: 'Getting started',
    groups: [{ slugs: ['what-is-janux', 'quick-start', 'project-structure', 'mental-model', 'editor-setup'] }],
  },
  {
    section: 'guide',
    label: 'Guide',
    groups: [
      { slugs: ['getting-started'] },
      {
        label: 'Components & state',
        slugs: [
          'components',
          'views-and-jsx',
          'keys-and-lists',
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
      {
        label: 'Agent harness',
        slugs: ['agent-memory', 'agent-guardrails', 'agent-workflows', 'agent-rate-limit', 'agent-mcp-client', 'agent-attachments'],
      },
      { label: 'Reactivity', slugs: ['signal', 'computed', 'watch', 'batch', 'untrack', 'owners'] },
      { label: 'Helpers', slugs: ['every', 'parse-duration', 'create-bus', 'i18n-api'] },
      { label: 'Client & CLI', slugs: ['client-api', 'client-state', 'data-cache-api', 'foreign', 'client-runtime', 'client-tools', 'cli', 'build-internals'] },
    ],
  },
  {
    section: 'recipes',
    label: 'Recipes',
    groups: [
      {
        slugs: [
          'testing-components',
          'forms',
          'optimistic-ui',
          'error-handling',
          'tailwind',
          'auth-and-context',
          'cross-island-events',
          'custom-server',
          'monorepo-setup',
          'agent-evals-in-ci',
          'deploying',
          'vercel',
          'docker',
          'external-mcp-clients',
          'local-model-copilot',
          'debugging-webmcp',
        ],
      },
    ],
  },
  { section: 'more', label: 'More', groups: [{ slugs: ['examples', 'comparison', 'benchmarks', 'faq', 'glossary'] }] },
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

/** The pages the shared scorer runs over — also serialized to search-index.json at build. */
export function searchCorpus(): SearchPage[] {
  return docIndex().map(({ section, slug, title }) => {
    const markdown = docContent(section, slug) ?? '';

    return { section, slug, title, headings: headingsOf(markdown), text: stripMarkdown(markdown) };
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
