import { existsSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/**
 * What `public/` is served as in dev. The list has to reach as far as the built
 * server's (`@janux/cli` static-assets) or a file works in one and not in the
 * other: a `<video>` handed `application/octet-stream` simply does not play,
 * and that is a difference between `janux dev` and production rather than a
 * broken file.
 */
const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown',
  '.xml': 'application/xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/x-wav',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export function mimeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
}

/** Resolves a request path inside `<root>/public`, refusing traversal outside it. */
export function resolvePublicFile(root: string, pathname: string): string | undefined {
  const publicDir = join(root, 'public');
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const candidate = join(publicDir, decoded);
  const rel = relative(publicDir, candidate);

  if (rel.startsWith('..') || rel === '') return undefined;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return undefined;

  return candidate;
}
