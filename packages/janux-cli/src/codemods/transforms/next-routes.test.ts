import { describe, expect, it } from 'bun:test';
import { nextRoutePath, nextRoutes } from './next-routes';

/** Every path rule, as a table: this is the whole contract of the move. */
const MOVES: [from: string, to: string][] = [
  // App Router pages, layouts and error pages.
  ['app/page.tsx', 'src/routes/index.tsx'],
  ['src/app/page.tsx', 'src/routes/index.tsx'],
  ['app/about/page.tsx', 'src/routes/about/index.tsx'],
  ['app/blog/[slug]/page.tsx', 'src/routes/blog/[slug]/index.tsx'],
  ['app/docs/[...path]/page.tsx', 'src/routes/docs/[...path]/index.tsx'],
  ['app/search/[[...filters]]/page.tsx', 'src/routes/search/[[...filters]]/index.tsx'],
  ['app/(marketing)/about/page.tsx', 'src/routes/(marketing)/about/index.tsx'],
  ['app/layout.tsx', 'src/routes/_layout.tsx'],
  ['app/blog/layout.tsx', 'src/routes/blog/_layout.tsx'],
  ['app/not-found.tsx', 'src/routes/_404.tsx'],
  ['app/error.tsx', 'src/routes/_500.tsx'],
  ['app/global-error.tsx', 'src/routes/_500.tsx'],
  // App Router handlers: `route.ts` already exports methods by name, like Janux does.
  ['app/api/hello/route.ts', 'src/api/hello.ts'],
  ['app/api/users/[id]/route.ts', 'src/api/users/[id].ts'],
  ['app/api/route.ts', 'src/api/index.ts'],
  // Colocated files are not routes: `src/routes` turns every non-underscore file into one.
  ['app/blog/PostCard.tsx', 'src/components/blog/PostCard.tsx'],
  ['app/blog/post.module.css', 'src/components/blog/post.module.css'],
  // Pages Router: every file under `pages/` is already a route.
  ['pages/index.tsx', 'src/routes/index.tsx'],
  ['pages/about.tsx', 'src/routes/about.tsx'],
  ['pages/blog/[slug].tsx', 'src/routes/blog/[slug].tsx'],
  ['pages/_app.tsx', 'src/routes/_layout.tsx'],
  ['pages/404.tsx', 'src/routes/_404.tsx'],
  ['pages/500.tsx', 'src/routes/_500.tsx'],
  ['pages/api/hello.ts', 'src/api/hello.ts'],
  ['src/pages/api/webhooks/stripe.ts', 'src/api/webhooks/stripe.ts'],
];

describe('next/routes path mapping', () => {
  for (const [from, to] of MOVES) {
    it(`${from} → ${to}`, () => {
      expect(nextRoutePath(from)).toBe(to);
    });
  }

  it('leaves files outside a Next router root where they are', () => {
    expect(nextRoutePath('lib/db.ts')).toBeUndefined();
    expect(nextRoutePath('src/routes/index.tsx')).toBeUndefined();
  });

  it('does not move a Next-only file convention that Janux has no equivalent for', () => {
    expect(nextRoutePath('app/loading.tsx')).toBeUndefined();
    expect(nextRoutePath('app/sitemap.ts')).toBeUndefined();
    expect(nextRoutePath('pages/_document.tsx')).toBeUndefined();
  });
});

describe('next/routes codemod', () => {
  it('is a framework migration, not a version upgrade', () => {
    expect(nextRoutes.since).toBeUndefined();
  });

  it('applies under a router root only', () => {
    expect(nextRoutes.appliesTo('app/page.tsx')).toBe(true);
    expect(nextRoutes.appliesTo('src/pages/about.tsx')).toBe(true);
    expect(nextRoutes.appliesTo('src/routes/index.tsx')).toBe(false);
    expect(nextRoutes.appliesTo('lib/db.ts')).toBe(false);
  });

  it('reports the move and rebases the imports the move broke, in one result', () => {
    const result = nextRoutes.run({ code: "import { PostCard } from './PostCard';\n", file: 'app/blog/page.tsx' });

    expect(result.moveTo).toBe('src/routes/blog/index.tsx');
    expect(result.code).toBe("import { PostCard } from '../../components/blog/PostCard';\n");
  });

  it('moves a file whose imports need nothing, without inventing an edit', () => {
    const result = nextRoutes.run({ code: "import { a } from 'janux';\n", file: 'app/page.tsx' });

    expect(result.moveTo).toBe('src/routes/index.tsx');
    expect(result.code).toBeUndefined();
  });

  it('says what a Next-only convention became, instead of moving it somewhere wrong', () => {
    const result = nextRoutes.run({ code: 'export default function Loading() {}\n', file: 'app/loading.tsx' });

    expect(result.moveTo).toBeUndefined();
    expect(result.notes?.join(' ')).toMatch(/suspense/i);
  });

  it('warns that a non-`api` route handler changes URL, because Janux mounts handlers under /api', () => {
    const result = nextRoutes.run({ code: 'export function GET() {}\n', file: 'app/rss/route.ts' });

    expect(result.moveTo).toBe('src/api/rss.ts');
    expect(result.notes?.join(' ')).toMatch(/\/api\/rss/);
  });

  it('reports a Pages Router handler as work, because req/res is not a Response', () => {
    const result = nextRoutes.run({ code: 'export default function handler(req, res) {}\n', file: 'pages/api/hello.ts' });

    expect(result.moveTo).toBe('src/api/hello.ts');
    expect(result.notes?.join(' ')).toMatch(/Response/);
  });

  it('is a no-op once the app is already Janux-shaped', () => {
    expect(nextRoutes.run({ code: "import { a } from 'janux';\n", file: 'src/routes/index.tsx' })).toEqual({});
  });
});
