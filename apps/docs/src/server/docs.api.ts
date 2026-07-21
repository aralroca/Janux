import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api } from '@janux/server';
import { schema, str, list } from 'janux';

const CONTENT_DIR = join(import.meta.dirname, '../../content');

/** Ordered sections → ordered slugs. The single source of truth for nav, prev/next and search. */
export const SECTIONS: Record<string, string[]> = {
  guide: [
    'getting-started',
    'components',
    'schema',
    'intents-and-guards',
    'sources-effects-events',
    'stores',
    'ssr-and-resumability',
    'api-rpc',
    'agent-and-copilot',
    'cli-and-deployment',
    'architecture-and-roadmap',
  ],
  tutorial: ['tasks-app-part-1', 'tasks-app-part-2', 'tasks-app-part-3'],
  reference: ['core-api', 'schema-api', 'server-api', 'agent-api', 'client-api', 'cli'],
  recipes: [
    'testing-components',
    'auth-and-context',
    'cross-island-events',
    'deploying',
    'external-mcp-clients',
  ],
  more: ['comparison', 'faq', 'glossary'],
};

export interface DocRef {
  section: string;
  slug: string;
  path: string;
  title: string;
}

export function docContent(section: string, slug: string): string | undefined {
  if (!/^[a-z0-9-]+$/.test(section) || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  if (!SECTIONS[section]?.includes(slug)) return undefined;
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
  return Object.entries(SECTIONS).flatMap(([section, slugs]) =>
    slugs
      .filter((slug) => docContent(section, slug) !== undefined)
      .map((slug) => ({
        section,
        slug,
        path: `/docs/${section}/${slug}`,
        title: titleOf(section, slug),
      })),
  );
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
  description: 'Full-text search across the documentation. Returns matching lines with section/slug.',
  input: schema({ query: str().min(2) }),
  run: ({ input }) => ({
    matches: docIndex().flatMap(({ section, slug }) => {
      const lines = (docContent(section, slug) ?? '').split('\n');

      return lines
        .filter((line) => line.toLowerCase().includes(input.query.toLowerCase()))
        .slice(0, 3)
        .map((line) => ({ section, slug, line: line.trim() }));
    }),
  }),
});
