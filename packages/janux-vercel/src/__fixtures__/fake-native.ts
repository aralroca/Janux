import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A string that only appears in the bundle if the module was inlined. */
export const FAKE_NATIVE_MARKER = 'FAKE_NATIVE_MARKER_9f2c';

/**
 * A stand-in for a package that ships a platform binary. Pure JS on purpose:
 * the fixture app imports it, and every test that bundles *without*
 * `--native` must still produce a bundle that boots — the marker inlines and
 * everything works. A test that externalizes it asserts the opposite: the
 * specifier survives and the marker does not travel.
 *
 * Written at test time, not committed: the fixture's `node_modules` is
 * ignored by git, so a checked-in copy would never reach CI.
 */
export function ensureFakeNative(app: string): void {
  const dir = join(app, 'node_modules/fake-native');

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"name":"fake-native","version":"1.2.3","main":"index.js"}\n');
  writeFileSync(join(dir, 'index.js'), `module.exports = { marker: '${FAKE_NATIVE_MARKER}' };\n`);
}
