import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { bundleInputs, cssAssetName, localeRedirectStub, prodServerOptions } from './commands';

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

/**
 * The HTML shell links exactly one sheet, `/styles.css`, so that name belongs to
 * the app's stylesheet and nothing else. Handing it to every CSS asset made the
 * winner emission-order luck: a dependency's CSS (Monaco, a component library)
 * could take the name and the app would ship unstyled, its own sheet emitted as
 * `styles2.css` and linked by nobody.
 */
describe('cssAssetName', () => {
  const name = cssAssetName('/app', '/app/src/styles.css');

  it('gives the fixed name to the app stylesheet only', () => {
    expect(name({ names: ['styles.css'], originalFileNames: ['src/styles.css'] })).toBe('styles.css');
    expect(name({ names: ['editor.css'], originalFileNames: ['node_modules/monaco/editor.css'] })).toBe(
      'assets/[name]-[hash][extname]',
    );
    // Same basename, different file: still not the app's sheet.
    expect(name({ names: ['styles.css'], originalFileNames: ['node_modules/widget/styles.css'] })).toBe(
      'assets/[name]-[hash][extname]',
    );
  });

  it('leaves every other asset hashed, and needs no stylesheet to work', () => {
    expect(name({ names: ['logo.svg'], originalFileNames: ['public/logo.svg'] })).toBe(
      'assets/[name]-[hash][extname]',
    );
    expect(cssAssetName('/app', undefined)({ names: ['styles.css'], originalFileNames: ['src/styles.css'] })).toBe(
      'assets/[name]-[hash][extname]',
    );
  });
});

/** An app root with the conventional files a shell field is resolved from. */
function appRoot(config: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-prod-options-'));

  mkdirSync(join(root, 'public'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  writeFileSync(join(root, 'public/favicon.svg'), '<svg/>');
  writeFileSync(join(root, 'src/styles.css'), 'body{}');
  writeFileSync(join(root, 'janux.config.ts'), `export default ${JSON.stringify(config)}`);

  return root;
}

/**
 * Dev resolved the favicon and prod didn't, so every `janux build` shipped a
 * shell with no icon link and the browser fell back to a 404 `/favicon.ico` —
 * a console error on every page of every Janux app. The shell fields now come
 * from one mapping, so dev and prod cannot drift apart again.
 */
describe('prodServerOptions shell fields', () => {
  it('forwards every shell field the app config resolves', async () => {
    const options = await prodServerOptions(appRoot({ title: 'Fixture', lang: 'es' }));

    expect(options.favicon).toBe('/favicon.svg');
    expect(options.title).toBe('Fixture');
    expect(options.lang).toBe('es');
    expect(options.stylesheets).toEqual(['/styles.css']);
    expect(options.inlineStyles).toBeUndefined();
  });

  it('inlines the built sheet instead of linking it when asked', async () => {
    const root = appRoot({ inlineStyles: true });

    mkdirSync(join(root, 'dist/client'), { recursive: true });
    writeFileSync(join(root, 'dist/client/styles.css'), 'body{color:red}');
    const options = await prodServerOptions(root);

    expect(options.inlineStyles).toEqual(['body{color:red}']);
    expect(options.stylesheets).toEqual([]);
  });

  /** Before the first build there is no sheet to read; linking it beats shipping none. */
  it('falls back to the link when the built sheet is not there yet', async () => {
    const options = await prodServerOptions(appRoot({ inlineStyles: true }));

    expect(options.inlineStyles).toBeUndefined();
    expect(options.stylesheets).toEqual(['/styles.css']);
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
