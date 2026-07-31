import { describe, expect, it } from 'bun:test';
import { cacheHeaders, cachePolicy } from './policy';

describe('cachePolicy()', () => {
  it('defaults to private — a policy that says nothing may not reach a shared cache', () => {
    const policy = cachePolicy({ name: 'account' });

    expect(policy.scope).toBe('private');
    expect(policy.maxAgeMs).toBe(0);
    expect(policy.sharedMaxAgeMs).toBe(0);
    expect(policy.swrMs).toBe(0);
    expect(policy.tags).toEqual([]);
  });

  it('takes durations as the framework grammar or as milliseconds', () => {
    const spelled = cachePolicy({ name: 'a', scope: 'public', maxAge: '5m', sharedMaxAge: '1h', swr: '30s' });
    const numeric = cachePolicy({ name: 'b', scope: 'public', maxAge: 300_000, sharedMaxAge: 3_600_000, swr: 30_000 });

    expect(spelled.maxAgeMs).toBe(numeric.maxAgeMs);
    expect(spelled.sharedMaxAgeMs).toBe(numeric.sharedMaxAgeMs);
    expect(spelled.swrMs).toBe(numeric.swrMs);
  });

  it('rejects a shared-cache directive on a private policy — that is a bug, not a preference', () => {
    expect(() => cachePolicy({ name: 'a', sharedMaxAge: '5m' })).toThrow(/private/);
    expect(() => cachePolicy({ name: 'a', swr: '5m' })).toThrow(/private/);
    expect(() => cachePolicy({ name: 'a', scope: 'private', sharedMaxAge: '5m' })).toThrow(/private/);
  });

  it('rejects malformed input at declaration time, not at request time', () => {
    expect(() => cachePolicy({ name: 'a', maxAge: '5 minutes' })).toThrow(/duration/);
    expect(() => cachePolicy({ name: '', scope: 'public' })).toThrow(/name/);
    expect(() => cachePolicy({ name: 'a', scope: 'public', maxAge: -1 })).toThrow(/negative/);
  });

  it('is frozen, so a shared policy cannot be mutated by one of the routes using it', () => {
    const policy = cachePolicy({ name: 'a', scope: 'public', sharedMaxAge: '5m' });

    expect(Object.isFrozen(policy)).toBe(true);
  });
});

describe('cacheHeaders()', () => {
  it('answers the fail-safe when a route declares nothing', () => {
    expect(cacheHeaders(undefined)).toEqual({ 'cache-control': 'private, no-store' });
  });

  it('keeps a private policy off every shared cache', () => {
    const headers = cacheHeaders(cachePolicy({ name: 'a', maxAge: '30s' }));

    expect(headers['cache-control']).toBe('private, max-age=30');
    expect(headers['cache-control']).not.toContain('s-maxage');
    expect(headers['cache-control']).not.toContain('public');
  });

  it('emits the four directives a CDN needs for a public policy', () => {
    const headers = cacheHeaders(
      cachePolicy({ name: 'a', scope: 'public', maxAge: '10s', sharedMaxAge: '5m', swr: '1h' }),
    );

    expect(headers['cache-control']).toBe('public, max-age=10, s-maxage=300, stale-while-revalidate=3600');
  });

  it('varies public responses on the navigation header — the SPA body differs from the cold one', () => {
    const policy = cachePolicy({ name: 'a', scope: 'public', sharedMaxAge: '5m' });

    expect(cacheHeaders(policy, { vary: ['x-janux-navigation'] }).vary).toBe('x-janux-navigation');
    // A private response is never shared, so there is nothing to key.
    expect(cacheHeaders(cachePolicy({ name: 'b' }), { vary: ['x-janux-navigation'] }).vary).toBeUndefined();
  });

  it('interpolates route params into tag templates', () => {
    const policy = cachePolicy({ name: 'a', scope: 'public', sharedMaxAge: '5m', tags: ['catalog', 'product:[id]'] });

    expect(cacheHeaders(policy, { params: { id: '42' } })['cache-tag']).toBe('catalog, product:42');
  });

  it('drops a tag whose param the request has no value for, instead of emitting a literal "[id]"', () => {
    const policy = cachePolicy({ name: 'a', scope: 'public', sharedMaxAge: '5m', tags: ['catalog', 'product:[id]'] });

    expect(cacheHeaders(policy, { params: {} })['cache-tag']).toBe('catalog');
  });

  it('writes tags under the header the CDN in front actually reads', () => {
    const policy = cachePolicy({ name: 'a', scope: 'public', sharedMaxAge: '5m', tags: ['catalog', 'home'] });

    // Fastly keys on Surrogate-Key, and separates with spaces rather than commas.
    expect(cacheHeaders(policy, { tagHeader: 'Surrogate-Key' })['surrogate-key']).toBe('catalog home');
    expect(cacheHeaders(policy, { tagHeader: 'Surrogate-Key' })['cache-tag']).toBeUndefined();
  });

  it('never leaks tags on a private response — they describe shared-cache contents', () => {
    const policy = cachePolicy({ name: 'a', tags: ['catalog'] });

    expect(cacheHeaders(policy)['cache-tag']).toBeUndefined();
  });
});
