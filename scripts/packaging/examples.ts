/**
 * `create-janux --example <name>` and `--template <name>` scaffold from
 * directories that live at the repo root, so the published package carries a
 * copy of both.
 *
 * Embedded for the length of one archive, like the manifest — and by the pack
 * step as well as the release, or CI would inspect a `create-janux` tarball
 * missing the very directories those flags read.
 */
import { cpSync, rmSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * The directories those flags read — and the file they reference: an app's
 * tsconfig `extends` the shared base two levels up, which is the package root
 * once embedded, so the base travels with them or every scaffold from the
 * tarball dies on a path that resolves nowhere.
 */
const SCAFFOLDING = ['examples', 'templates', 'tsconfig.base.json'];
const SKIP = new Set(['node_modules', 'dist', 'bun.lock', '.janux', 'build']);
/**
 * Everything `.gitignore` hides except the one file meant to ship: a
 * maintainer's `.env.local` is invisible to `git status`, and releases are
 * packed from a maintainer's machine.
 */
const SECRET = /^\.env(\..*)?$/;

const embeddedAt = (source: string) => `packages/create-janux/${source}`;
const carried = (path: string) => !SKIP.has(basename(path)) && (!SECRET.test(basename(path)) || basename(path) === '.env.example');

export async function withScaffolding<T>(dir: string, action: () => Promise<T>): Promise<T> {
  if (dir !== 'create-janux') return action();

  SCAFFOLDING.forEach((source) => {
    rmSync(embeddedAt(source), { recursive: true, force: true });
    cpSync(source, embeddedAt(source), { recursive: true, filter: carried });
  });

  try {
    return await action();
  } finally {
    SCAFFOLDING.forEach((source) => rmSync(embeddedAt(source), { recursive: true, force: true }));
  }
}
