import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

/**
 * Extract the `index`-th ts/tsx fence of a repo-relative markdown page,
 * apply literal `stubs` replacements (app-local imports → test doubles),
 * write it as a generated module and import it — the documented example
 * runs for real, so behavioral drift fails the suite.
 */
export async function docExample(page: string, index = 0, stubs: Record<string, string> = {}): Promise<any> {
  const source = readFileSync(join(ROOT, page), 'utf8');
  const fences = [...source.matchAll(/```(?:tsx?|jsx?)(?:[ \t]+[^\n]*)?\n([\s\S]*?)```/g)];
  const code = Object.entries(stubs).reduce((acc, [from, to]) => acc.replaceAll(from, to), fences[index]![1]!);
  const file = join(import.meta.dir, `.${page.replaceAll('/', '__').replace(/\.md$/, '')}-${index}.generated.tsx`);

  writeFileSync(file, code);

  return import(file);
}
