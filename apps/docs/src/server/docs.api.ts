import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api } from '@janux/server';
import { schema, str, list } from 'janux';

const CONTENT_DIR = join(import.meta.dirname, '../../content');

export function docSlugs(): string[] {
  return readdirSync(CONTENT_DIR)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.replace(/\.md$/, ''))
    .sort();
}

export function docContent(slug: string): string | undefined {
  if (!/^[a-z0-9-]+$/.test(slug)) return undefined;
  try {
    return readFileSync(join(CONTENT_DIR, `${slug}.md`), 'utf-8');
  } catch {
    return undefined;
  }
}

export const listDocs = api({
  description: 'List all documentation pages (slug and title)',
  output: schema({ docs: list({ slug: str(), title: str() }) }),
  run: () => ({
    docs: docSlugs().map((slug) => ({
      slug,
      title: docContent(slug)?.match(/^# (.+)$/m)?.[1] ?? slug,
    })),
  }),
});

export const readDoc = api({
  description: 'Read one documentation page as markdown, by slug',
  input: schema({ slug: str() }),
  run: ({ input }) => ({ slug: input.slug, markdown: docContent(input.slug) ?? 'Not found' }),
});

export const searchDocs = api({
  description: 'Full-text search across the documentation. Returns matching lines with their slug.',
  input: schema({ query: str().min(2) }),
  run: ({ input }) => ({
    matches: docSlugs().flatMap((slug) => {
      const lines = (docContent(slug) ?? '').split('\n');

      return lines
        .filter((line) => line.toLowerCase().includes(input.query.toLowerCase()))
        .slice(0, 3)
        .map((line) => ({ slug, line: line.trim() }));
    }),
  }),
});
