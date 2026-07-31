/**
 * What `reference/` actually documents, page by page.
 *
 * Only code and headings count. An English word that happens to match an
 * export ("every mutation is audited") documents nothing — a real API mention
 * lives in a signature, an example or the heading that names it.
 *
 * `export-coverage.test.ts` asks whether a name is documented at all; the
 * STABILITY.md generator asks *which* pages document it, because two of them
 * say in their own first paragraph that you do not need them to build an app.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REFERENCE_DIR = resolve(import.meta.dir, '../../apps/docs/content/reference');
const MENTIONS = [/```[^\n]*\n([\s\S]*?)```/g, /`([^`\n]+)`/g, /^#{1,4} (.+)$/gm];

export type ReferencePage = { readonly slug: string; readonly code: string };

function codeOf(text: string): string {
  return MENTIONS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1])).join('\n');
}

export const PAGES: ReferencePage[] = readdirSync(REFERENCE_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => ({ slug: file.replace(/\.md$/, ''), code: codeOf(readFileSync(join(REFERENCE_DIR, file), 'utf8')) }));

/** The pages that mention a name, by slug. */
export function documentedBy(name: string): string[] {
  const mention = new RegExp(`\\b${name}\\b`);

  return PAGES.filter((page) => mention.test(page.code)).map((page) => page.slug);
}

export function isDocumented(name: string): boolean {
  return documentedBy(name).length > 0;
}
