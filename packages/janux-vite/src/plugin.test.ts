import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runtimeIncludes } from './deps';
import { devAsset, devStylesheets, fallsThroughToVite, foreignExternals, isApiModule, janux } from './plugin';

/**
 * Regression: the dev shell used to link `/src/styles.css`, which Vite's
 * pipeline serves as a JS module (`text/javascript`) because that's how CSS
 * HMR works. A <link rel="stylesheet"> pointing at a JS-typed response is a
 * MIME mismatch: the browser is free to refuse it, and — since the response
 * carries no charset — to decode the UTF-8 bytes as Latin-1, which turned
 * `content: '▾'` into mojibake. `?direct` is Vite's contract for the compiled
 * stylesheet itself, served as `text/css`.
 */

describe('devStylesheets', () => {
  it('requests the raw stylesheet so Vite serves text/css, not a JS module', () => {
    expect(devStylesheets('/app', '/app/src/styles.css')).toEqual(['/src/styles.css?direct']);
  });

  it('keeps an existing query intact', () => {
    expect(devStylesheets('/app', '/app/src/styles.css?inline')).toEqual(['/src/styles.css?inline&direct']);
  });

  it('is empty when the app has no stylesheet', () => {
    expect(devStylesheets('/app', undefined)).toEqual([]);
  });
});

/**
 * Vite's fallback is for paths the app has no answer for. An app with a `_404`
 * page does have one — under `janux dev` its document must reach the browser
 * instead of Vite's own miss.
 */
describe('the dev 404 fall-through', () => {
  const notFound = (body: string, contentType?: string) =>
    new Response(body, { status: 404, headers: contentType ? { 'content-type': contentType } : {} });

  it('keeps the rendered _404 document', () => {
    expect(fallsThroughToVite(notFound('<h1>gone</h1>', 'text/html; charset=utf-8'), '/nope')).toBe(false);
  });

  it('falls through for a bare page-router miss', () => {
    expect(fallsThroughToVite(notFound('Not found'), '/nope')).toBe(true);
  });

  it('never touches a response the framework or an api handler owns', () => {
    expect(fallsThroughToVite(notFound('{}', 'application/json'), '/api/orders/9')).toBe(false);
    expect(fallsThroughToVite(notFound('{}', 'application/json'), '/_janux/api/x')).toBe(false);
  });

  it('leaves everything that is not a 404 alone', () => {
    expect(fallsThroughToVite(new Response('ok'), '/')).toBe(false);
  });
});

/**
 * Regression: `janux build` failed on a scaffolded app with
 * "Rollup failed to resolve import react from janux/src/client/foreign.ts".
 * foreign() imports React dynamically, but Rollup resolves dynamic imports
 * statically — so an app that never uses foreign islands could not build.
 */
describe('foreignExternals', () => {
  it('externalizes React for an app that has not installed it', () => {
    const bare = mkdtempSync(join(tmpdir(), 'janux-no-react-'));

    expect(foreignExternals(bare)).toEqual(['react', 'react-dom', 'react-dom/client']);
  });

  it('bundles React normally for an app root that resolves it', () => {
    const withReact = resolve(import.meta.dir, '../../../examples/interop-react');

    expect(foreignExternals(withReact)).toEqual([]);
  });
});

/**
 * Vite finds what to pre-bundle by crawling HTML files, and a Janux app has none.
 * Left to discover deps mid-session it re-optimizes, re-hashes every dep URL and
 * 504s the imports already in flight — how `localLlm()` came to answer "Local
 * model unavailable". The client entry and `runtimeIncludes` are what it crawls
 * and pre-bundles instead.
 */
describe('the optimizer config', () => {
  const docs = resolve(import.meta.dir, '../../../apps/docs');

  it('names the app entry Vite has no HTML to infer, and the framework deps behind it', async () => {
    const config = await (janux().config as any)({ root: docs }, { command: 'serve', mode: 'development' });

    expect(config.optimizeDeps.entries).toEqual(['src/client.ts']);
    expect(config.optimizeDeps.include).toEqual(runtimeIncludes(docs));
  });
});

const API_SOURCE = "export const list = api({ description: 'List', run: () => [] });\n";

/** The client-stub transform, called the way Vite calls it. */
async function transformed(root: string, id: string, code = API_SOURCE): Promise<string | undefined> {
  const plugin: any = janux();

  await plugin.config({ root }, { command: 'build', mode: 'production' });

  return (await plugin.transform.call({}, code, id, undefined))?.code;
}

/**
 * The rule used to be "any module whose path ends in `.api.ts|js`" — a filename
 * a dependency is free to use. `monaco-editor/esm/vs/editor/editor.api.js` was
 * therefore projected into fetch stubs in every production build, which is how
 * `monaco.languages` became an async function and the docs playground died on
 * arrival with `languages.register is not a function`. An app's api modules live
 * in its server directory; nothing outside it is one.
 */
describe('api() client stubs', () => {
  const docs = resolve(import.meta.dir, '../../../apps/docs');

  it("projects the app's own api modules into typed fetch stubs", async () => {
    const code = await transformed(docs, join(docs, 'src/server/docs.api.ts'));

    expect(code).toContain('clientApi("docs.list")');
  });

  it('leaves a dependency that happens to name a file *.api.js alone', async () => {
    const monaco = join(docs, 'node_modules/monaco-editor/esm/vs/editor/editor.api.js');

    expect(await transformed(docs, monaco, 'export const languages = { register() {} };\n')).toBeUndefined();
  });

  it('leaves an app file outside the server directory alone', async () => {
    expect(await transformed(docs, join(docs, 'src/components/widget.api.ts'))).toBeUndefined();
  });
});

/**
 * What `janux dev` answers before the app gets a look. Public files were always
 * here; image variants join them, because an `<Image>` that only resolves after
 * `janux build` would be a broken image for the whole time you are writing the
 * page.
 */
describe('devAsset', () => {
  const app = resolve(import.meta.dir, '__fixtures__/image-app');

  it('serves a file straight out of public/', async () => {
    const response = await devAsset(app, '/logo.svg');

    expect(response?.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('encodes an image variant on demand, so dev shows what the build will ship', async () => {
    const response = await devAsset(app, '/_janux/image/photos/hero.jpg/320.webp');

    expect(response?.headers.get('content-type')).toBe('image/webp');
  });

  it('leaves anything else to the app', async () => {
    expect(await devAsset(app, '/posts/hello')).toBeUndefined();
  });
});

/**
 * On Windows the app config carries native paths (`C:\app\src`) while Vite
 * hands out forward-slashed ids (`C:/app/src/...`). A raw-string prefix test
 * between the two never matches, so every api module silently stopped being
 * projected into client stubs — these pin the Windows shapes on any OS.
 */
describe('paths that mix Windows and Vite separators', () => {
  it('derives the stylesheet URL from a native Windows root and entry', () => {
    expect(devStylesheets('C:\\app', 'C:\\app\\src\\styles.css')).toEqual(['/src/styles.css?direct']);
  });

  it('recognizes an api module under a native Windows server dir', () => {
    expect(isApiModule('C:\\app\\src\\server', 'C:/app/src/server/docs.api.ts')).toBe(true);
  });

  it('still recognizes one under a POSIX server dir', () => {
    expect(isApiModule('/app/src/server', '/app/src/server/docs.api.ts?v=1')).toBe(true);
  });

  it('still leaves a dependency outside the server dir alone', () => {
    expect(isApiModule('C:\\app\\src\\server', 'C:/app/node_modules/monaco-editor/esm/vs/editor/editor.api.js')).toBe(false);
  });

  it('still leaves a server file that is not an api module alone', () => {
    expect(isApiModule('/app/src/server', '/app/src/server/notes.ts')).toBe(false);
  });
});
