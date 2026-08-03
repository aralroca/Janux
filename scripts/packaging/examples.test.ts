import { describe, expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { withScaffolding } from './examples';

/**
 * `--example` and `--template` read directories that live at the repo root, not
 * inside the package — so what the tarball carries is decided here, at pack
 * time, and nowhere else. The `files` field advertising them proves nothing:
 * npm ships an entry that does not exist as silence, and the published CLI
 * would offer an empty gallery.
 */

const EMBEDDED = [
  'packages/create-janux/examples/shop',
  'packages/create-janux/templates/dashboard',
  // What `templates/<name>/tsconfig.json` reaches for with `../../`.
  'packages/create-janux/tsconfig.base.json',
];

describe('pack-time scaffolding', () => {
  test('embeds the examples and the templates for create-janux, then removes them', async () => {
    const during = await withScaffolding('create-janux', async () => EMBEDDED.map(existsSync));

    expect(during).toEqual([true, true, true]);
    expect(EMBEDDED.map(existsSync)).toEqual([false, false, false]);
  });

  test('leaves every other package alone', async () => {
    const during = await withScaffolding('janux', async () => EMBEDDED.map(existsSync));

    expect(during).toEqual([false, false, false]);
  });

  test('never copies install artifacts into the archive', async () => {
    const copied = await withScaffolding('create-janux', async () =>
      existsSync('packages/create-janux/templates/dashboard/node_modules'),
    );

    expect(copied).toBe(false);
  });

  /**
   * `.gitignore` hides `.env.*`, so a maintainer's own one is invisible to
   * `git status` — and a release is packed from a maintainer's machine.
   */
  test('carries .env.example and never a real .env', async () => {
    const secret = 'templates/dashboard/.env.local';

    writeFileSync(secret, 'ANTHROPIC_API_KEY=sk-not-a-real-key\n');
    try {
      const embedded = await withScaffolding('create-janux', async () => ({
        secret: existsSync('packages/create-janux/templates/dashboard/.env.local'),
        example: existsSync('packages/create-janux/templates/dashboard/.env.example'),
      }));

      expect(embedded).toEqual({ secret: false, example: true });
    } finally {
      rmSync(secret, { force: true });
    }
  });
});
