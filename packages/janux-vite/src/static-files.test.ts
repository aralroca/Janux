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
});
