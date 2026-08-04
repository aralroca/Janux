import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineCollection, getCollection, getEntry, type CollectionEntry } from '@janux/content';
import { api } from '@janux/server';
import { schema, str, list } from 'janux';
import { searchPages, type SearchPage } from '../search/score';
import { slugify, stripMarkdown } from './markdown';

/**
 * The pages are files on disk, so this has to hold wherever the module ends up.
 *
 * When Bun runs the source, this file's own directory locates them. Once a
 * deployment adapter has bundled the server it does not — `import.meta.dirname`
 * is then the *bundle's* directory — and the app root the adapter published
 * (`process.env.JANUX_APP_ROOT`) does.
 *
 * Preferring what this file can see, over what it was told, is what makes the
 * choice independent of who ran first: a process that serves several apps — the
 * e2e suite does — publishes each of their roots in turn, and several of them
 * have a `content/` directory of their own to be mistaken for this one.
 */
export function contentDir(): string {
  const beside = join(import.meta.dirname, '../../content');

  if (existsSync(beside)) return beside;

  return join(process.env.JANUX_APP_ROOT ?? '', 'content');
}

const CONTENT_DIR = contentDir();

/**
 * The docs are a content collection, so a page's metadata is checked by the
 * same `schema()` that types an island's state. Titles and descriptions used to
 * be guessed out of the body — an H1 regex and a first-paragraph heuristic —
 * which meant a page could ship with the wrong title and nothing would notice.
 * A page missing either field now fails the build, by name.
 */
export const docs = defineCollection({
  dir: CONTENT_DIR,
  schema: schema({ title: str(), description: str() }),
});

export type DocEntry = CollectionEntry<typeof docs>;

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
    groups: [
      { slugs: ['what-is-janux', 'quick-start', 'the-agentic-web', 'project-structure', 'mental-model', 'editor-setup'] },
    ],
  },
  {
    section: 'guide',
    label: 'Guide',
    groups: [
      { label: 'Overview', slugs: ['getting-started'] },
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
          'http-cache',
          'interop',
          'design-system',
        ],
      },
      { label: 'Content', slugs: ['content-collections'] },
      { label: 'Rendering & navigation', slugs: ['ssr-and-resumability', 'navigation', 'images', 'fonts', 'i18n'] },
      { label: 'Server & agents', slugs: ['api-rpc', 'http-handlers', 'agent-and-copilot', 'skills'] },
      { label: 'Shipping', slugs: ['cli-and-deployment', 'service-workers', 'architecture-and-roadmap'] },
    ],
  },
  {
    section: 'styles',
    label: 'Styles',
    groups: [
      { label: 'Basics', slugs: ['overview', 'global-styles', 'inline-and-jsx'] },
      { label: 'Techniques', slugs: ['css-variables', 'dark-mode', 'sass', 'tailwind'] },
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
      { label: 'Packages', slugs: ['core-api', 'schema-api', 'server-api', 'agent-api', 'content-api', 'observability-api', 'testing-api'] },
      {
        label: 'Agent harness',
        slugs: [
          'agent-memory',
          'agent-guardrails',
          'agent-workflows',
          'agent-schedules',
          'agent-rate-limit',
          'agent-mcp-client',
          'agent-attachments',
        ],
      },
      { label: 'Reactivity', slugs: ['signal', 'computed', 'watch', 'batch', 'untrack', 'owners', 'for'] },
      { label: 'Helpers', slugs: ['every', 'parse-duration', 'create-bus', 'i18n-api', 'worker', 'service-worker'] },
      { label: 'Client & CLI', slugs: ['client-api', 'client-state', 'data-cache-api', 'foreign', 'client-runtime', 'client-tools', 'cli', 'codemods', 'build-internals'] },
    ],
  },
  {
    section: 'recipes',
    label: 'Recipes',
    groups: [
      { label: 'UI patterns', slugs: ['forms', 'optimistic-ui', 'error-handling', 'cross-island-events'] },
      { label: 'Server & project', slugs: ['auth-and-context', 'custom-server', 'csp', 'monorepo-setup'] },
      {
        label: 'Agents & MCP',
        slugs: ['local-model-copilot', 'external-mcp-clients', 'a2a-and-agent-card', 'debugging-webmcp', 'agent-evals-in-ci'],
      },
      { label: 'Testing & deployment', slugs: ['testing-components', 'deploying', 'adapters', 'vercel', 'docker', 'sentry'] },
    ],
  },
  {
    section: 'more',
    label: 'More',
    groups: [
      { slugs: ['templates', 'examples', 'interop-matrix', 'comparison', 'benchmarks', 'faq', 'glossary'] },
      { label: 'Migrating', slugs: ['migrating-from-next', 'migrating-from-astro'] },
    ],
  },
];

export interface DocRef {
  section: string;
  slug: string;
  path: string;
  title: string;
  description: string;
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

/**
 * One doc, by section and slug. The nav is the allowlist: a file that exists but
 * is not listed is not a page, and a slug that is not `[a-z0-9-]` never becomes
 * a lookup at all.
 */
export function docEntry(section: string, slug: string): DocEntry | undefined {
  if (!/^[a-z0-9-]+$/.test(section) || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  if (!sectionSlugs(section).includes(slug)) return undefined;

  return getEntry(docs, `${section}/${slug}`);
}

/** A doc's markdown body — the frontmatter block is metadata, not content. */
export function docContent(section: string, slug: string): string | undefined {
  return docEntry(section, slug)?.body;
}

/**
 * Flat ordered index of every existing doc — drives sidebar, prev/next and
 * search. One pass over the collection, not one lookup per slug: every page
 * render builds this for its prev/next links.
 */
export function docIndex(): DocRef[] {
  const entries = new Map(getCollection(docs).map((entry) => [entry.id, entry]));

  return SECTIONS.flatMap(({ section }) =>
    sectionSlugs(section).flatMap((slug) => {
      const entry = entries.get(`${section}/${slug}`);

      if (!entry) return [];

      return [{ section, slug, path: `/docs/${section}/${slug}`, title: entry.data.title, description: entry.data.description }];
    }),
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
  description: 'List all documentation pages (section, slug, title, description)',
  output: schema({ docs: list({ section: str(), slug: str(), title: str(), description: str() }) }),
  run: () => ({ docs: docIndex().map(({ section, slug, title, description }) => ({ section, slug, title, description })) }),
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
