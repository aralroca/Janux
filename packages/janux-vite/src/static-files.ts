import { existsSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
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
