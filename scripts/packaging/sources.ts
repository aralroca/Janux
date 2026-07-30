/**
 * What goes into `dist`, and how a relative specifier finds its neighbour there.
 *
 * The build set is the answer to both questions: resolution is checked against
 * it rather than against the disk, so production code importing a fixture is an
 * error at build time instead of a missing file in the published tarball.
 */
import { Glob } from 'bun';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Colocated tests, typecheck-only files and fixture apps are source, not product
 * — spelled once for both ends of the build, so what is kept out of `dist` and
 * what is refused in a tarball cannot become two different opinions.
 */
export const NOT_PRODUCT = /(^|\/)(__fixtures__|__snapshots__)\/|\.(test|spec|typecheck|bench)\.[cm]?[jt]sx?$/;

const EXCLUDED = new RegExp(`${NOT_PRODUCT.source}|\\.d\\.ts$`);

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Every source the package publishes, package-relative and sorted for stable output. */
export async function buildSet(root: string): Promise<string[]> {
  const globbed = await Array.fromAsync(new Glob('src/**/*.{ts,tsx}').scan({ cwd: root }));
  const sources = globbed.map((path) => path.replaceAll('\\', '/')).filter((path) => !EXCLUDED.test(path));

  return [...sources, ...(existsSync(join(root, 'bin.ts')) ? ['bin.ts'] : [])].sort();
}

/** `src/a/b.ts` → `dist/src/a/b.js`: the tree is mirrored, so nothing has to be relocated. */
export function outputPath(source: string): string {
  return `dist/${source.replace(/\.tsx?$/, '.js')}`;
}

/**
 * The extension Node needs, relative to the importing file — `'./dir'` becomes
 * `'./dir/index.js'` when that is what the directory holds.
 */
export function specifierResolver(source: string, built: Set<string>): (specifier: string) => string | undefined {
  const here = dirname(source);

  return (specifier) => {
    const target = CANDIDATES.map((suffix) => join(here, specifier + suffix)).find((candidate) => built.has(candidate));

    if (!target) return undefined;
    const path = relative(here, target).replaceAll('\\', '/').replace(/\.tsx?$/, '.js');

    return path.startsWith('.') ? path : `./${path}`;
  };
}
