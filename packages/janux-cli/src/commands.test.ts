import { describe, expect, it } from 'bun:test';
import { localeRedirectStub } from './commands';

/** Runs the stub's inline script with a fake navigator/location and returns the redirect target. */
function redirectOf(locales: string[], defaultLocale: string, languages: string[]): string {
  const script = /<script>(.*?)<\/script>/s.exec(localeRedirectStub(locales, defaultLocale))![1]!;
  let target = '';

  new Function('navigator', 'location', script)({ languages }, { replace: (url: string) => (target = url) });

  return target;
}

/** The stub must negotiate like the server's `detectLocale` (accept-language half) — see i18n-routing.ts. */
describe('localeRedirectStub', () => {
  it('matches exact, base and regional locales like the server does', () => {
    expect(redirectOf(['en', 'es'], 'en', ['es'])).toBe('/es');
    expect(redirectOf(['en', 'es'], 'en', ['es-MX'])).toBe('/es');
    expect(redirectOf(['en', 'pt-BR'], 'en', ['pt'])).toBe('/pt-BR');
    expect(redirectOf(['en', 'es'], 'en', ['fr-FR'])).toBe('/en');
    expect(redirectOf(['en', 'es'], 'en', [])).toBe('/en');
  });

  it('keeps the no-JS meta refresh pointing at the default locale', () => {
    expect(localeRedirectStub(['en', 'es'], 'en')).toContain('content="1; url=/en"');
  });
});
