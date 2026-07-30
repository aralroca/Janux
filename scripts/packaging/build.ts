/**
 * Compiles a package to ESM in `dist/`, with declarations and sourcemaps.
 *
 * Deliberately not a bundler: every source file becomes one output file, so the
 * module graph a consumer loads is the one the tests exercise — a bundle would
 * merge modules and give a shared registry more than one instance depending on
 * which entry point pulled it in.
 *
 * Per-file transpiling is only sound because `tsconfig.base.json` sets
 * `verbatimModuleSyntax: true`: SWC sees one file at a time and cannot know that
 * a re-exported name is a type, so without it `export { SomeType } from './x'`
 * would compile to a runtime re-export of a binding that does not exist.
 *
 * Declaration maps are not emitted: they can only point at `.ts` files, and
 * `dist` is all the tarball ships. The JS maps carry their sources inline
 * instead, so a stack trace resolves without them.
 */
import { transform } from '@swc/core';
import { $ } from 'bun';
import { rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { rewriteSpecifiers } from './specifiers';
import { buildSet, outputPath, specifierResolver } from './sources';

const TS_CONFIG = '.tsconfig.build.json';
/** Repo-relative: these scripts run from the repository root, and `bunx` costs ~50ms a spawn. */
const TSC = './node_modules/.bin/tsc';
/** `tsc` startup dominates the build and the gain saturates at four (measured). */
const CONCURRENCY = 4;

async function compile(root: string, source: string, built: Set<string>): Promise<void> {
  const output = outputPath(source);
  const name = output.split('/').pop()!;
  const { code, map } = await transform(await Bun.file(join(root, source)).text(), {
    filename: source,
    sourceMaps: true,
    inlineSourcesContent: true,
    // Read relative to the map, which sits under `dist` — not to the package root.
    sourceFileName: relative(dirname(output), source).replaceAll('\\', '/'),
    isModule: true,
    jsc: {
      target: 'esnext',
      parser: { syntax: 'typescript', tsx: source.endsWith('.tsx') },
      transform: { react: { runtime: 'automatic', importSource: 'janux' } },
    },
  });
  const resolved = rewriteSpecifiers(code, { resolve: specifierResolver(source, built) });

  await Bun.write(join(root, output), `${resolved}\n//# sourceMappingURL=${name}.map\n`);
  await Bun.write(join(root, `${output}.map`), map!);
}

function config(sources: string[]): string {
  return JSON.stringify({
    extends: './tsconfig.json',
    compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: 'dist', rootDir: '.' },
    // `files` is additive with an inherited `include`, and the package's own
    // include is what drags the colocated tests back in.
    include: [],
    files: sources,
  });
}

/**
 * Declarations come from `tsc` over the build set exactly, via a generated
 * config: driving it off the package's own `include` would emit the colocated
 * tests too, and then `dist` and the build set would disagree about what the
 * package is.
 */
async function declarations(root: string, sources: string[]): Promise<void> {
  const path = join(root, TS_CONFIG);

  await Bun.write(path, config(sources));
  try {
    // Not `.quiet()`: a `ShellError` says only "Failed with exit code 2", and a
    // declaration-emit error is unfixable without the diagnostics tsc printed.
    const emitted = await $`${TSC} -p ${path}`.nothrow().quiet();

    if (emitted.exitCode !== 0) throw new Error(`declarations failed for ${root}\n${emitted.stdout.toString()}${emitted.stderr.toString()}`);
  } finally {
    rmSync(path, { force: true });
  }
}

/** `src/a/b.ts` → `dist/src/a/b.d.ts`: tsc mirrors the same tree the JS does. */
function declarationPath(source: string): string {
  return `dist/${source.replace(/\.tsx?$/, '.d.ts')}`;
}

async function extendDeclaration(root: string, source: string, built: Set<string>): Promise<void> {
  const path = join(root, declarationPath(source));
  const code = await Bun.file(path).text();

  await Bun.write(path, rewriteSpecifiers(code, { resolve: specifierResolver(source, built), dts: true }));
}

/** Compiles `root` (a package directory) into `root/dist`, and returns what it wrote. */
export async function buildPackage(root: string): Promise<string[]> {
  const sources = await buildSet(root);
  const built = new Set(sources);

  rmSync(join(root, 'dist'), { recursive: true, force: true });
  await Promise.all(sources.map((source) => compile(root, source, built)));
  await declarations(root, sources);
  await Promise.all(sources.map((source) => extendDeclaration(root, source, built)));

  return [...sources.map(outputPath), ...sources.map(declarationPath)].sort();
}

/** Four at a time: one `tsc` per package is the whole cost of a build. */
export async function buildPackages(roots: string[]): Promise<Map<string, string[]>> {
  const built = new Map<string, string[]>();

  for (let at = 0; at < roots.length; at += CONCURRENCY) {
    const batch = roots.slice(at, at + CONCURRENCY);
    const outputs = await Promise.all(batch.map(buildPackage));

    batch.forEach((root, index) => built.set(root, outputs[index]!));
  }

  return built;
}
