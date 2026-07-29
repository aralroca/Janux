import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A parsed `content/*.md` file: front matter fields plus the markdown body. */
export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  body: string;
}

const CONTENT_DIR = fileURLToPath(new URL('../content/', import.meta.url));
const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;
const FIELD = /^([a-z]+):\s*(.*)$/;

function parseFields(block: string): Record<string, string> {
  const entries = block
    .split('\n')
    .map((line) => FIELD.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1]!, match[2]!] as const);

  return Object.fromEntries(entries);
}

function parsePost(file: string): Post {
  const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
  const matter = FRONT_MATTER.exec(raw);
  const fields = parseFields(matter?.[1] ?? '');

  return {
    slug: file.replace(/\.md$/, ''),
    title: fields.title ?? file,
    date: fields.date ?? '',
    description: fields.description ?? '',
    body: raw.slice(matter?.[0].length ?? 0).trim(),
  };
}

/** Every post, newest first — the index order and the `staticParams` source. */
export function posts(): Post[] {
  return readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.md'))
    .map(parsePost)
    .sort((first, second) => second.date.localeCompare(first.date));
}

export function postBySlug(slug: string): Post | undefined {
  return posts().find((post) => post.slug === slug);
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** `2026-07-20` → `Jul 20, 2026`; the raw value stays in `<time datetime>`. */
export function formatDate(date: string): string {
  return date ? DATE_FORMAT.format(new Date(date)) : '';
}

/** Rough byline figure at 200 words a minute, never below one minute. */
export function readingMinutes(post: Post): number {
  return Math.max(1, Math.round(post.body.split(/\s+/).length / 200));
}
