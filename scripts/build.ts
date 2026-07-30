#!/usr/bin/env bun
/**
 * Compiles the publishable packages to `dist/`.
 *
 *   bun scripts/build.ts              # all of them
 *   bun scripts/build.ts janux        # one, by directory name
 */
import { buildPackages } from './packaging/build';
import { isPublishable, packageDir, PUBLISH_ORDER } from './packaging/packages';

const requested = Bun.argv.slice(2).filter((argument) => !argument.startsWith('-'));
const unknown = requested.filter((dir) => !isPublishable(dir));

if (unknown.length > 0) {
  console.error(`build: unknown package(s): ${unknown.join(', ')}`);
  process.exit(1);
}

const dirs = requested.length > 0 ? requested : [...PUBLISH_ORDER];
const started = Bun.nanoseconds();
const built = await buildPackages(dirs.map(packageDir));

built.forEach((outputs, root) => console.log(`✔ ${root} — ${outputs.length} files`));
console.log(`✔ ${built.size} packages in ${Math.round((Bun.nanoseconds() - started) / 1e6)}ms`);
