/**
 * `create-janux --example <name>` scaffolds from the monorepo's own examples, so
 * the published package carries a copy of them.
 *
 * Embedded for the length of one archive, like the manifest — and by the pack
 * step as well as the release, or CI would inspect a `create-janux` tarball
 * missing the very directory `--example` reads.
 */
import { cpSync, rmSync } from 'node:fs';
import { basename } from 'node:path';

const EMBEDDED = 'packages/create-janux/examples';
const SKIP = new Set(['node_modules', 'dist', 'bun.lock', '.env']);

export async function withExamples<T>(dir: string, action: () => Promise<T>): Promise<T> {
  if (dir !== 'create-janux') return action();
  rmSync(EMBEDDED, { recursive: true, force: true });
  cpSync('examples', EMBEDDED, { recursive: true, filter: (source) => !SKIP.has(basename(source)) });
  try {
    return await action();
  } finally {
    rmSync(EMBEDDED, { recursive: true, force: true });
  }
}
