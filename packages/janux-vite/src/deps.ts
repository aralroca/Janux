/**
 * What the app has in `node_modules`, and what Vite must pre-bundle because of it.
 */
import { existsSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

/** The package a specifier belongs to: `react-dom/client` → `react-dom`, `@scope/lib/ui` → `@scope/lib`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');

  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

function ancestors(from: string): string[] {
  const real = existsSync(from) ? realpathSync(from) : from;
  const parts = real.split(sep);

  return parts.map((_, index) => parts.slice(0, parts.length - index).join(sep) || sep);
}

/**
 * Where a package is installed, looked up the way Node does — the nearest
 * `node_modules` up the real path, symlinks followed. `Bun.resolveSync` answers
 * this from Bun's global install cache too, which reports packages the app never
 * installed.
 */
export function packageDir(specifier: string, from: string): string | undefined {
  const name = packageName(specifier);

  return ancestors(from)
    .map((dir) => join(dir, 'node_modules', name))
    .find((dir) => existsSync(join(dir, 'package.json')));
}

/**
 * Everything the framework's browser runtime imports, each paired with the
 * package that owns it — `janux` and `@janux/agent` are excluded from
 * pre-bundling (they are the SSR surface) and Vite never looks inside an excluded
 * package, so it met these the first time the module importing them was
 * requested: mid-session, which re-optimizes and re-hashes every dep URL, 504ing
 * the ones already in flight — `localLlm()`'s dynamic import, loudly ("Local
 * model unavailable"). Apps cannot be asked to enumerate the framework's own
 * deps: those change with the framework, not with the app. `react`/`react-dom`
 * have no owner because they are the app's peers — Vite resolves them from the
 * app root, not from `janux`, which never depends on them.
 */
const RUNTIME_BROWSER_DEPS: [dep: string, owner?: string][] = [
  ['diff-dom-streaming', 'janux'],
  ['react'],
  ['react-dom/client'],
  ['@aralroca/gui-agent', '@janux/agent'],
  ['@aralroca/gui-agent/ai-sdk', '@janux/agent'],
  ['@aralroca/gui-agent/ui', '@janux/agent'],
  ['@browser-ai/transformers-js', '@janux/agent'],
];

/** Only what this app installed: an include Vite can't resolve is a warning on every dev start. */
export function runtimeIncludes(root: string): string[] {
  const installed = ([dep, owner]: [string, string?]): boolean => {
    const from = owner ? packageDir(owner, root) : root;

    return from !== undefined && packageDir(dep, from) !== undefined;
  };

  return RUNTIME_BROWSER_DEPS.filter(installed).map(([dep, owner]) => (owner ? `${owner} > ${dep}` : dep));
}
