import { describe, expect, it } from 'bun:test';
import { bundleInputs, localeRedirectStub } from './commands';

/** Runs the stub's inline script with a fake navigator/location and returns the redirect target. */
function redirectOf(locales: string[], defaultLocale: string, languages: string[]): string {
  const script = /<script>(.*?)<\/script>/s.exec(localeRedirectStub(locales, defaultLocale))![1]!;
  let target = '';

  new Function('navigator', 'location', script)({ languages }, { replace: (url: string) => (target = url) });

  return target;
}

/**
 * The stylesheet used to be copied verbatim unless Tailwind was installed, so
 * `@import '@xyflow/react/dist/style.css'` — which Vite resolves in dev — shipped
 * to production as an unresolvable bare specifier. Whatever the app declares, the
 * bundler owns the CSS.
 */
describe('bundleInputs', () => {
  it('bundles the app stylesheet whether or not there is a client entry', () => {
    const app = { clientEntry: '/app/src/client.ts', stylesheet: '/app/src/styles.css' };

    expect(bundleInputs(app)).toEqual({ client: app.clientEntry, styles: app.stylesheet });
    expect(bundleInputs({ clientEntry: '', stylesheet: app.stylesheet })).toEqual({ styles: app.stylesheet });
    expect(bundleInputs({ clientEntry: '' })).toEqual({});
  });
});

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
