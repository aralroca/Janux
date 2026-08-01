import { describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mimeFor, resolvePublicFile } from './static-files';

const root = '/tmp/janux-static-test';

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/logo.svg'), '<svg/>');

describe('public/ static files', () => {
  it('resolves existing files inside public/', () => {
    expect(resolvePublicFile(root, '/logo.svg')).toBe(join(root, 'public/logo.svg'));
    expect(resolvePublicFile(root, '/missing.png')).toBeUndefined();
  });

  it('refuses path traversal outside public/', () => {
    expect(resolvePublicFile(root, '/../package.json')).toBeUndefined();
    expect(resolvePublicFile(root, '/%2e%2e/secret')).toBeUndefined();
  });

  it('maps mime types with a safe fallback', () => {
    expect(mimeFor('a.svg')).toBe('image/svg+xml');
    expect(mimeFor('a.woff2')).toBe('font/woff2');
    expect(mimeFor('a.unknown')).toBe('application/octet-stream');
  });

  /**
   * Dev serves `public/` itself, and the built server serves the same files
   * through its own table — so a type missing here is a file that works in
   * production and not while the page is being written. A `<video>` handed
   * `application/octet-stream` simply does not play.
   */
  it('serves the media and font formats a page embeds, as dev and prod agree they are', () => {
    expect(mimeFor('hero.mp4')).toBe('video/mp4');
    expect(mimeFor('hero.webm')).toBe('video/webm');
    expect(mimeFor('theme.mp3')).toBe('audio/mpeg');
    expect(mimeFor('inter.woff')).toBe('font/woff');
    expect(mimeFor('lib.wasm')).toBe('application/wasm');
    expect(mimeFor('hero.avif')).toBe('image/avif');
  });

  it('resolves a file whose name had to be encoded in the URL', () => {
    writeFileSync(join(root, 'public/my photo.png'), 'x');

    expect(resolvePublicFile(root, '/my%20photo.png')).toBe(join(root, 'public/my photo.png'));
  });

  it('refuses a percent sequence that is not valid encoding, rather than throwing', () => {
    expect(resolvePublicFile(root, '/%zz')).toBeUndefined();
  });

  it('refuses the directory itself, which is not a file to send', () => {
    mkdirSync(join(root, 'public/images'), { recursive: true });

    expect(resolvePublicFile(root, '/images')).toBeUndefined();
    expect(resolvePublicFile(root, '/')).toBeUndefined();
  });
});
