import { describe, expect, it } from 'bun:test';
import { devStylesheets } from './plugin';

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
