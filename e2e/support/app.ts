import { join } from 'node:path';

/**
 * The only repo-specific glue left: suites name apps by their workspace path
 * ('examples/i18n', 'apps/docs') and this resolves them. Everything else —
 * harness, servers, browser, quiescence — comes from `@janux/testing`, the
 * same surface the docs teach.
 */

/** Driving a real browser does not fit bun's 5s default. */
export const TIMEOUT = 60_000;

const REPO_ROOT = join(import.meta.dir, '../..');

/** Repo-relative app dir ('examples/i18n', 'apps/docs') → absolute root. */
export function appRoot(name: string): string {
  return join(REPO_ROOT, name);
}
