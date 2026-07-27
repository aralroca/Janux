import { describe, expect, it } from 'bun:test';
import { speculationRules } from './speculation';

describe('speculationRules', () => {
  it('prefetches every internal URL on hover by default', () => {
    expect(speculationRules(true)).toEqual({
      prefetch: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }],
    });
  });

  it('honours eagerness and turns excludes into negated matchers', () => {
    expect(speculationRules({ eagerness: 'eager', exclude: ['/logout', '/api/*'] })).toEqual({
      prefetch: [
        {
          where: {
            and: [
              { href_matches: '/*' },
              { not: { href_matches: '/logout' } },
              { not: { href_matches: '/api/*' } },
            ],
          },
          eagerness: 'eager',
        },
      ],
    });
  });

  it('emits nothing when turned off', () => {
    expect(speculationRules(false)).toBeUndefined();
  });

  /**
   * Once Janux intercepts navigations, a document-wide rule is waste: the
   * speculated document is never used (the SPA path fetches its own stream) and
   * the browser pays for it twice on hover. What is left are the links Janux
   * hands back to the browser.
   */
  it('scopes to native links once SPA navigation owns the rest', () => {
    expect(speculationRules(true, { nativeOnly: true })).toEqual({
      prefetch: [{ where: { selector_matches: 'a[data-native]' }, eagerness: 'moderate' }],
    });
  });

  it('keeps excludes when scoped to native links', () => {
    expect(speculationRules({ exclude: ['/logout'] }, { nativeOnly: true })).toEqual({
      prefetch: [
        {
          where: { and: [{ selector_matches: 'a[data-native]' }, { not: { href_matches: '/logout' } }] },
          eagerness: 'moderate',
        },
      ],
    });
  });
});
