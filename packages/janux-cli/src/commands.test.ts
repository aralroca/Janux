import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from '@janux/server';
import { jsx } from 'janux';
import {
  bundleInputs,
  cssAssetName,
  devBanner,
  emitAssets,
  localeRedirectStub,
  prerenderPages,
  viteOptions,
} from './commands';
import { prodServerOptions } from './prod';

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
  // An app root is whatever the OS calls absolute — `/app` here, `D:\app` on
  // Windows — and the sheet is derived from it, as `resolveAppConfig` derives it.
  const ROOT = resolve('/app');
  const name = cssAssetName(ROOT, join(ROOT, 'src/styles.css'));

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
    expect(cssAssetName(ROOT, undefined)({ names: ['styles.css'], originalFileNames: ['src/styles.css'] })).toBe(
      'assets/[name]-[hash][extname]',
    );
  });
});

/**
 * A running server projects every page as markdown at `<page>.md` (`/` → `/.md`,
 * see the server's `.md` suffix handling). A pure static host has no server to
 * project anything, so the build must emit those projections as files — before
 * this, the agent-face URLs a static export advertises 404'd on any static host.
 */
describe('prerenderPages', () => {
  const server = () =>
    createJanuxServer({
      routes: {
        '/': () => jsx('h1', { children: 'home sweet home' }),
        '/posts/hello': () => jsx('h1', { children: 'hello post' }),
        '/tags/[tag]': () => jsx('h1', { children: 'a tag' }),
      },
    });

  async function staticBuild(): Promise<string> {
    const outDir = mkdtempSync(join(tmpdir(), 'janux-prerender-'));

    await prerenderPages(server(), outDir);

    return outDir;
  }

  it('prerenders one index.html per concrete page and skips patterns', async () => {
    const outDir = await staticBuild();

    expect(readFileSync(join(outDir, 'index.html'), 'utf8')).toContain('home sweet home');
    expect(readFileSync(join(outDir, 'posts/hello/index.html'), 'utf8')).toContain('hello post');
    expect(existsSync(join(outDir, 'tags'))).toBe(false);
  });

  it('emits the .md projection of every page at the URL the server answers', async () => {
    const outDir = await staticBuild();

    expect(readFileSync(join(outDir, 'posts/hello.md'), 'utf8')).toContain('# hello post');
    expect(readFileSync(join(outDir, '.md'), 'utf8')).toContain('# home sweet home');
  });

  /** A static host answers an unknown path from `404.html` — there is no server to ask. */
  it('emits 404.html when the app has a _404 page, and nothing when it has none', async () => {
    const withPage = createJanuxServer({ routesDir: join(import.meta.dir, '__fixtures__/static-app/routes') });
    const outDir = mkdtempSync(join(tmpdir(), 'janux-prerender-'));

    await prerenderPages(withPage, outDir);
    expect(readFileSync(join(outDir, '404.html'), 'utf8')).toContain('no such page');
    expect(existsSync(join(await staticBuild(), '404.html'))).toBe(false);
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

describe('devBanner', () => {
  it('advertises every endpoint the dev server exposes, MCP included', () => {
    const lines = devBanner(4321).split('\n');

    expect(lines).toEqual([
      '  → app:      http://localhost:4321/',
      '  → manifest: http://localhost:4321/_janux/manifest',
      '  → agent:    http://localhost:4321/_janux/agent',
      '  → mcp:      http://localhost:4321/_janux/mcp',
    ]);
  });

  it('aligns the URLs in one column whatever the port', () => {
    const columns = devBanner(80).split('\n').map((line) => line.indexOf('http'));

    expect(new Set(columns).size).toBe(1);
  });
});

/**
 * A stack trace is only worth reading when it points at source. Dev gets full
 * maps — the framework's own frames included, which is exactly where an intent
 * failure lands — and production gets `hidden`: the `.map` files are emitted for
 * an error tracker to consume, with no `sourceMappingURL` appended to the
 * bundle, so shipping them costs the client nothing.
 */
describe('viteOptions sourcemaps', () => {
  it('gives dev full sourcemaps, framework frames included', async () => {
    const options = (await viteOptions('/app', 'dev')) as any;

    expect(options.css.devSourcemap).toBe(true);
    // Vite hides node_modules frames by default; the framework lives there
    // through the workspace link, so the chain would stop at the app's edge.
    expect(options.server.sourcemapIgnoreList()).toBe(false);
    expect(options.build).toBeUndefined();
  });

  it('emits production maps without pointing the bundle at them', async () => {
    const options = (await viteOptions('/app', 'build')) as any;

    expect(options.build.sourcemap).toBe('hidden');
    expect(options.css?.devSourcemap).toBeUndefined();
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

/**
 * `janux build` has to leave the image variants on disk whichever output the app
 * chose: a static export has no server left to encode them, and `janux start`
 * should never spend a request doing work the build already could.
 */
describe('emitAssets', () => {
  function appWithImage(): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-build-'));

    cpSync(join(import.meta.dir, '__fixtures__/image-app'), root, { recursive: true });

    return root;
  }

  // Real avif/webp encoding: a cold sharp does not fit bun's 5s default
  // (22s on Bun 1.3.0, the engines floor the CI matrix runs).
  it(
    'copies public/ verbatim and writes the variants <Image> links to',
    async () => {
      const root = appWithImage();

      await emitAssets(root, { fonts: [] });

      expect(existsSync(join(root, 'dist/client/hero.jpg'))).toBe(true);
      expect(existsSync(join(root, 'dist/client/_janux/image/hero.jpg/640.avif'))).toBe(true);
      expect(existsSync(join(root, 'dist/client/_janux/image/hero.jpg/1920.webp'))).toBe(true);
    },
    60_000,
  );

  it('is a no-op for an app with nothing to serve', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-build-'));

    await emitAssets(root, { fonts: [] });

    expect(existsSync(join(root, 'dist/client/_janux'))).toBe(false);
  });
});
