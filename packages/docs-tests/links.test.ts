import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { slugify } from '../../apps/docs/src/server/markdown';

/**
 * Third axis of docs truth: a link that 404s teaches nothing. Every internal
 * `/docs/...` link, every `#anchor`, every app route and every GitHub tree link
 * in the docs (and the README) is resolved against what actually exists — so a
 * renamed page or a deleted example fails the suite instead of shipping.
 */

const ROOT = resolve(import.meta.dir, '../..');
const CONTENT = join(ROOT, 'apps/docs/content');
const ROUTES = join(ROOT, 'apps/docs/src/routes');

function markdownFiles(): string[] {
  return [
    ...readdirSync(CONTENT, { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.md'))
      // Not `join`: it would answer backslashes on Windows, and these are
      // repo-relative display paths every check matches with forward slashes.
      .map((name) => `apps/docs/content/${name.replaceAll('\\', '/')}`),
    'README.md',
  ];
}

const files = markdownFiles();
const pages = new Set(
  files
    .filter((file) => file.startsWith('apps/docs/content/'))
    .map((file) => file.slice('apps/docs/content/'.length).replace(/\.md$/, '')),
);

/** Heading anchors a page exposes, using the renderer's own slugify. */
function anchorsOf(page: string): Set<string> {
  const markdown = readFileSync(join(CONTENT, `${page}.md`), 'utf8');
  const headings = [...markdown.matchAll(/^#{1,4} (.+)$/gm)].map((match) => slugify(match[1]!));

  return new Set(headings);
}

/** Top-level app routes (`/playground` → routes/playground.tsx). */
const appRoutes = new Set(
  readdirSync(ROUTES)
    .filter((name) => /\.tsx$/.test(name))
    .map((name) => name.replace(/\.tsx$/, '')),
);

interface Link {
  file: string;
  target: string;
}

function linksOf(file: string, pattern: RegExp): Link[] {
  const source = readFileSync(join(ROOT, file), 'utf8');

  return [...source.matchAll(pattern)].map((match) => ({ file, target: match[1]! }));
}

const DOCS_LINK = /\]\((\/docs\/[^)\s#]*)(?:#[^)\s]*)?\)/g;
const ANCHOR_LINK = /\]\((#[^)\s]+)\)/g;
const APP_LINK = /\]\((\/(?!docs\/)[^)\s#]*)(?:#[^)\s]*)?\)/g;
const GITHUB_TREE = /\]\(https:\/\/github\.com\/aralroca\/Janux\/(?:tree|blob)\/main\/([^)\s#]+)/g;

const all = <T>(mapper: (file: string) => T[]): T[] => files.flatMap(mapper);

describe('every documented link resolves', () => {
  it('internal /docs/<section>/<slug> links point at real pages', () => {
    const broken = all((file) => linksOf(file, DOCS_LINK)).filter(({ target }) => {
      const slug = target.replace(/^\/docs\/?/, '').replace(/\/$/, '');

      return slug !== '' && !pages.has(slug);
    });

    expect(broken).toEqual([]);
  });

  it('#anchors match a heading on their own page', () => {
    const broken = files
      .filter((file) => file.startsWith('apps/docs/content/'))
      .flatMap((file) => {
        const page = file.slice('apps/docs/content/'.length).replace(/\.md$/, '');
        const anchors = anchorsOf(page);

        return linksOf(file, ANCHOR_LINK).filter(({ target }) => !anchors.has(target.slice(1)));
      });

    expect(broken).toEqual([]);
  });

  it('cross-page #anchors match a heading on the target page', () => {
    const broken = all((file) => linksOf(file, /\]\((\/docs\/[^)\s#]+#[^)\s]+)\)/g)).filter(({ target }) => {
      const [path, anchor] = target.split('#');
      const slug = path!.replace(/^\/docs\//, '');

      return !pages.has(slug) || !anchorsOf(slug).has(anchor!);
    });

    expect(broken).toEqual([]);
  });

  it('non-docs app links point at a real route', () => {
    const broken = all((file) => linksOf(file, APP_LINK)).filter(({ target }) => {
      const route = target.replace(/^\//, '').replace(/\/$/, '');

      return route !== '' && !appRoutes.has(route) && !existsSync(join(ROOT, 'apps/docs/public', route));
    });

    expect(broken).toEqual([]);
  });

  it('GitHub links point at paths that exist in the repo', () => {
    const broken = all((file) => linksOf(file, GITHUB_TREE)).filter(
      ({ target }) => !existsSync(join(ROOT, target)),
    );

    expect(broken).toEqual([]);
  });

  it('checks a meaningful number of links', () => {
    expect(all((file) => linksOf(file, DOCS_LINK)).length).toBeGreaterThan(100);
  });

  /** A hand-written count is the first thing to rot when pages are added. */
  it('the page count the README advertises is the real one', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const claimed = Number(/— (\d+) pages/.exec(readme)?.[1]);

    expect(claimed).toBe(pages.size);
  });
});
