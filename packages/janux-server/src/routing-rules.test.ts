import { describe, expect, it } from 'bun:test';
import { createRoutingRules } from './routing-rules';

/**
 * Declared `redirects`/`rewrites` (janux.config.ts), matched with the file
 * router's own segment grammar — there is no second pattern language, so every
 * case here is a case the route tree already understands.
 */

const rulesFor = (config: Parameters<typeof createRoutingRules>[0]) => createRoutingRules(config)!;
const at = (path: string) => new URL(`http://test${path}`);

describe('createRoutingRules', () => {
  it('is undefined when the app declares none — the request pays nothing', () => {
    expect(createRoutingRules({})).toBeUndefined();
    expect(createRoutingRules({ redirects: [], rewrites: [] })).toBeUndefined();
  });
});

describe('redirects', () => {
  it('answers a legacy URL with a permanent 308 by default', () => {
    const rules = rulesFor({ redirects: [{ from: '/old-home', to: '/' }] });
    const response = rules.redirect(at('/old-home'))!;

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/');
  });

  it('takes the four explicit statuses', () => {
    const status = ([301, 302, 307, 308] as const).map(
      (code) => rulesFor({ redirects: [{ from: '/a', to: '/b', status: code }] }).redirect(at('/a'))!.status,
    );

    expect(status).toEqual([301, 302, 307, 308]);
  });

  it('leaves an unmatched path alone', () => {
    expect(rulesFor({ redirects: [{ from: '/old', to: '/new' }] }).redirect(at('/other'))).toBeUndefined();
  });

  it('captures `[param]` and writes it into the destination', () => {
    const rules = rulesFor({ redirects: [{ from: '/blog/[slug]', to: '/posts/[slug]' }] });

    expect(rules.redirect(at('/blog/hello-world'))!.headers.get('location')).toBe('/posts/hello-world');
  });

  it('captures `[...rest]`, keeping the whole tail', () => {
    const rules = rulesFor({ redirects: [{ from: '/docs/[...path]', to: '/guide/[...path]' }] });

    expect(rules.redirect(at('/docs/deploy/vercel'))!.headers.get('location')).toBe('/guide/deploy/vercel');
    // A catch-all needs at least one segment, exactly as in the route tree.
    expect(rules.redirect(at('/docs'))).toBeUndefined();
  });

  it('captures `[[...rest]]`, which also matches with nothing to catch', () => {
    const rules = rulesFor({ redirects: [{ from: '/search/[[...filters]]', to: '/find/[[...filters]]' }] });

    expect(rules.redirect(at('/search'))!.headers.get('location')).toBe('/find');
    expect(rules.redirect(at('/search/kind/article'))!.headers.get('location')).toBe('/find/kind/article');
  });

  it('honours typed matchers — the same ones the router uses', () => {
    const rules = rulesFor({ redirects: [{ from: '/t/[id=integer]', to: '/tickets/[id]' }] });

    expect(rules.redirect(at('/t/123'))!.headers.get('location')).toBe('/tickets/123');
    expect(rules.redirect(at('/t/abc'))).toBeUndefined();
  });

  it('honours the app’s custom matchers', () => {
    const rules = rulesFor({
      redirects: [{ from: '/p/[code=ticker]', to: '/price/[code]' }],
      matchers: { ticker: (value) => /^[A-Z]{3,4}$/.test(value) },
    });

    expect(rules.redirect(at('/p/MSFT'))!.headers.get('location')).toBe('/price/MSFT');
    expect(rules.redirect(at('/p/msft'))).toBeUndefined();
  });

  it('carries the query string over when the destination declares none', () => {
    const rules = rulesFor({ redirects: [{ from: '/old', to: '/new' }, { from: '/legacy', to: '/new?from=legacy' }] });

    expect(rules.redirect(at('/old?ref=email'))!.headers.get('location')).toBe('/new?ref=email');
    // A destination that already asks a question keeps its own.
    expect(rules.redirect(at('/legacy?ref=email'))!.headers.get('location')).toBe('/new?from=legacy');
  });

  it('sends the visitor to another origin when the destination is absolute', () => {
    const rules = rulesFor({ redirects: [{ from: '/chat', to: 'https://discord.gg/janux', status: 302 }] });

    expect(rules.redirect(at('/chat'))!.headers.get('location')).toBe('https://discord.gg/janux');
  });

  it('resolves in declaration order — the first rule that matches wins', () => {
    const rules = rulesFor({
      redirects: [
        { from: '/docs/[...path]', to: '/guide/[...path]' },
        { from: '/docs/intro', to: '/never' },
      ],
    });

    expect(rules.redirect(at('/docs/intro'))!.headers.get('location')).toBe('/guide/intro');
  });

  it('percent-encodes what it captured, so a destination is always a valid URL', () => {
    const rules = rulesFor({ redirects: [{ from: '/blog/[slug]', to: '/posts/[slug]' }] });

    expect(rules.redirect(at('/blog/a%20b'))!.headers.get('location')).toBe('/posts/a%20b');
  });
});

describe('rewrites', () => {
  it('serves another route without the browser being told', () => {
    const rules = rulesFor({ rewrites: [{ from: '/help/[...path]', to: '/docs/[...path]' }] });

    expect(rules.rewrite('/help/deploy')).toBe('/docs/deploy');
  });

  it('leaves an unmatched path alone', () => {
    expect(rulesFor({ rewrites: [{ from: '/help', to: '/docs' }] }).rewrite('/other')).toBeUndefined();
  });

  it('follows a chain of rewrites to where it settles', () => {
    const rules = rulesFor({
      rewrites: [
        { from: '/a', to: '/b' },
        { from: '/b', to: '/c' },
      ],
    });

    expect(rules.rewrite('/a')).toBe('/c');
  });

  /** The documented number, pinned: 8 hops settle, a 9th is a chain that does not. */
  it('follows exactly as many hops as the guide promises', () => {
    const links = (count: number) => Array.from({ length: count }, (_, index) => ({ from: `/s${index}`, to: `/s${index + 1}` }));

    expect(rulesFor({ rewrites: links(8) }).rewrite('/s0')).toBe('/s8');
    expect(() => rulesFor({ rewrites: links(9) }).rewrite('/s0')).toThrow(/did not settle after 8 hops/);
  });

  it('refuses a cycle with an error naming the loop', () => {
    const rules = rulesFor({
      rewrites: [
        { from: '/loop', to: '/ring' },
        { from: '/ring', to: '/loop' },
      ],
    });

    expect(() => rules.rewrite('/loop')).toThrow(/rewrite chain did not settle.*\/loop.*\/ring/s);
  });
});

/**
 * The framework's own surface is not addressable through a rewrite: `/_janux/*`
 * is where the invocation pipeline enforces guards (design invariant 4), and a
 * URL that could be pointed at it would be a way around them.
 */
describe('rewrites cannot reach the framework surface', () => {
  it('refuses a literal `/_janux` destination at boot', () => {
    expect(() => createRoutingRules({ rewrites: [{ from: '/proxy', to: '/_janux/mcp' }] })).toThrow(/_janux/);
  });

  it('refuses one assembled from the URL at request time, without failing the request', () => {
    const rules = rulesFor({ rewrites: [{ from: '/proxy/[...path]', to: '/[...path]' }] });

    // The tail comes off the wire, so this must not be a 500 either — the
    // rewrite simply does not apply and the original path goes on to 404.
    expect(rules.rewrite('/proxy/_janux/mcp')).toBeUndefined();
    expect(rules.rewrite('/proxy/docs')).toBe('/docs');
  });

  it('never rewrites or redirects a request already addressed to `/_janux/*`', () => {
    const rules = rulesFor({
      redirects: [{ from: '/[...all]', to: '/moved/[...all]' }],
      rewrites: [{ from: '/[...all]', to: '/catch/[...all]' }],
    });

    expect(rules.redirect(at('/_janux/mcp'))).toBeUndefined();
    expect(rules.rewrite('/_janux/mcp')).toBeUndefined();
    // The same greedy rules still apply to everything else.
    expect(rules.redirect(at('/anything'))!.headers.get('location')).toBe('/moved/anything');
  });

  it('refuses a rewrite to another origin — a rewrite serves a route of this app', () => {
    expect(() => createRoutingRules({ rewrites: [{ from: '/px', to: 'https://eu.posthog.com/e' }] })).toThrow(/must start with/);
  });
});

describe('config mistakes are caught at boot, not in production', () => {
  it('rejects a source that is not a root-relative path', () => {
    expect(() => createRoutingRules({ redirects: [{ from: 'old', to: '/new' }] })).toThrow(/must start with/);
  });

  /** No hop limit can catch this one: the loop runs in the browser, not the server. */
  it('rejects a redirect pointing at its own source', () => {
    expect(() => createRoutingRules({ redirects: [{ from: '/a', to: '/a' }] })).toThrow(/endless loop/);
    // A rewrite onto itself is a chain, and the hop limit does catch that.
    expect(() => createRoutingRules({ rewrites: [{ from: '/a', to: '/a' }] })).not.toThrow();
  });

  it('rejects a status that is not a redirect status', () => {
    expect(() => createRoutingRules({ redirects: [{ from: '/a', to: '/b', status: 404 as 301 }] })).toThrow(/301, 302, 307 or 308/);
  });
});
