import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { devStylesheets, foreignExternals } from './plugin';

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
