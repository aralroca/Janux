#!/usr/bin/env bun
/**
 * Refuses a publish whose manifest still advertises TypeScript.
 *
 * Every publishable package runs this as `prepublishOnly`, so the guarantee does
 * not depend on going through `scripts/release.ts`: that script swaps in the
 * compiled manifest before packing, and this check passes trivially there. Run
 * `bun publish` by hand in a package directory instead and the manifest on disk
 * is the development one — `files` already says `dist`, so the tarball would
 * carry compiled output while telling Node to load `./src/index.ts`.
 */
import { advertisesSource } from './packaging/manifest';

const pkg = await Bun.file('package.json').json();
const source = advertisesSource(pkg);

if (source.length > 0) {
  console.error(`${pkg.name}: refusing to publish a manifest that advertises source: ${source.join(', ')}`);
  console.error('Publish with `bun run release` from the repository root — it compiles and swaps in the published manifest.');
  process.exit(1);
}
