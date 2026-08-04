import { describe, expect, it } from 'bun:test';
import { astroRoutePath, astroRoutes } from './astro-routes';

describe('astro/routes path mapping', () => {
  it('moves an endpoint into the handler tree', () => {
    expect(astroRoutePath('src/pages/api/hello.ts')).toBe('src/api/hello.ts');
    expect(astroRoutePath('src/pages/api/users/[id].ts')).toBe('src/api/users/[id].ts');
  });

  it('moves an endpoint that Astro served outside `api/` too', () => {
    expect(astroRoutePath('src/pages/rss.xml.ts')).toBe('src/api/rss.xml.ts');
  });

  it('does not move a template: `.astro` is a language Janux does not run', () => {
    expect(astroRoutePath('src/pages/index.astro')).toBeUndefined();
    expect(astroRoutePath('src/pages/blog/[slug].astro')).toBeUndefined();
  });

  it('leaves files outside `src/pages` alone', () => {
    expect(astroRoutePath('src/layouts/Base.astro')).toBeUndefined();
    expect(astroRoutePath('src/routes/index.tsx')).toBeUndefined();
  });
});

describe('astro/routes codemod', () => {
  it('applies under `src/pages` only', () => {
    expect(astroRoutes.appliesTo('src/pages/index.astro')).toBe(true);
    expect(astroRoutes.appliesTo('src/layouts/Base.astro')).toBe(false);
  });

  it('tells a template where its rewritten page belongs, rather than moving a file that cannot run', () => {
    const result = astroRoutes.run({ code: '---\n---\n<h1>Hi</h1>\n', file: 'src/pages/blog/[slug].astro' });

    expect(result.moveTo).toBeUndefined();
    expect(result.code).toBeUndefined();
    expect(result.notes?.join(' ')).toContain('src/routes/blog/[slug].tsx');
  });

  it('names the underscore file an Astro 404 becomes', () => {
    expect(astroRoutes.run({ code: '---\n---\n', file: 'src/pages/404.astro' }).notes?.join(' ')).toContain('src/routes/_404.tsx');
  });

  it('points a markdown page at content collections instead of a route file', () => {
    expect(astroRoutes.run({ code: '# Hi\n', file: 'src/pages/about.md' }).notes?.join(' ')).toMatch(/collection/i);
  });

  it('moves an endpoint and warns about the `/api` prefix when Astro did not serve it there', () => {
    const result = astroRoutes.run({ code: 'export function GET() {}\n', file: 'src/pages/rss.xml.ts' });

    expect(result.moveTo).toBe('src/api/rss.xml.ts');
    expect(result.notes?.join(' ')).toContain('/api/rss.xml');
  });

  it('moves an `api/` endpoint without inventing a warning', () => {
    const result = astroRoutes.run({ code: 'export function GET() {}\n', file: 'src/pages/api/hello.ts' });

    expect(result.moveTo).toBe('src/api/hello.ts');
    expect(result.notes).toBeUndefined();
  });

  it('is a no-op on an app that is already Janux-shaped', () => {
    expect(astroRoutes.run({ code: 'export default function Home() {}\n', file: 'src/routes/index.tsx' })).toEqual({});
  });
});
