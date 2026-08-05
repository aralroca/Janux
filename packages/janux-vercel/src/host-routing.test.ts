import { describe, expect, it } from 'bun:test';
import { destination, hostRoutes, sourcePattern } from './host-routing';

/**
 * The router's pattern grammar, said in Vercel's. Everything here is a case the
 * file router already answers — these check that the translation agrees with it,
 * because a static export has nothing else left to be right.
 */

const matches = (pattern: string, path: string) => new RegExp(sourcePattern(pattern)).exec(path);

describe('sourcePattern', () => {
  it('anchors a static path so a longer URL cannot match it', () => {
    expect(matches('/old', '/old')).toBeTruthy();
    expect(matches('/old', '/old/deeper')).toBeNull();
    expect(matches('/old', '/not/old')).toBeNull();
  });

  it('escapes what is a literal in a path and a metacharacter in a regex', () => {
    expect(matches('/v1.0/docs', '/v1.0/docs')).toBeTruthy();
    expect(matches('/v1.0/docs', '/v1X0/docs')).toBeNull();
  });

  it('captures `[param]` as exactly one segment', () => {
    expect(matches('/blog/[slug]', '/blog/hello')?.groups).toEqual({ slug: 'hello' });
    expect(matches('/blog/[slug]', '/blog/a/b')).toBeNull();
  });

  it('captures `[...rest]` as one or more', () => {
    expect(matches('/docs/[...path]', '/docs/a/b')?.groups).toEqual({ path: 'a/b' });
    expect(matches('/docs/[...path]', '/docs')).toBeNull();
  });

  it('captures `[[...rest]]` as zero or more, the parent URL included', () => {
    expect(matches('/search/[[...filters]]', '/search')).toBeTruthy();
    expect(matches('/search/[[...filters]]', '/search/kind/article')?.groups).toEqual({ filters: 'kind/article' });
  });

  /**
   * A typed matcher narrows to one segment and no further: the CDN cannot run
   * the app's `integer` predicate, so the pattern must not pretend it does —
   * over-matching at the edge is a redirect that fires for `/t/abc` too, and
   * claiming otherwise would be worse than saying so.
   */
  it('narrows a typed segment to a segment, not to its type', () => {
    expect(matches('/t/[id=integer]', '/t/123')?.groups).toEqual({ id: '123' });
    expect(matches('/t/[id=integer]', '/t/abc')?.groups).toEqual({ id: 'abc' });
  });

  it('matches the root', () => {
    expect(matches('/', '/')).toBeTruthy();
  });
});

describe('destination', () => {
  it('spends a captured param as a back-reference', () => {
    expect(destination('/posts/[slug]')).toBe('/posts/$slug');
    expect(destination('/guide/[...path]')).toBe('/guide/$path');
  });

  it('leaves a static destination alone', () => {
    expect(destination('/')).toBe('/');
    expect(destination('/new/home')).toBe('/new/home');
  });

  it('keeps the origin of an off-site redirect', () => {
    expect(destination('https://docs.example.com/start')).toBe('https://docs.example.com/start');
  });
});

describe('hostRoutes', () => {
  it('is empty for an app that declared nothing', () => {
    expect(hostRoutes()).toEqual([]);
  });

  it('puts redirects before rewrites, each in declaration order', () => {
    const table = hostRoutes([{ from: '/a', to: '/b' }], [{ from: '/c', to: '/d' }]);

    expect(table).toEqual([
      { src: '^/a$', headers: { Location: '/b' }, status: 308 },
      { src: '^/c$', dest: '/d' },
    ]);
  });
});
