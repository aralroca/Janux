import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from '@swc/core';

/**
 * The island catalog a client build emits (`islands.json` beside `client.js`):
 * island name → module URL, '' meaning the def ships inside the runtime
 * bundle. A page whose only islands sit behind suspense boundaries has an
 * empty SSR registry when the streaming interlude flushes — the catalog is how
 * production still knows the runtime must ship (`ServerOptions.islandModules`).
 */

const DEF_FACTORIES = new Set(['component', 'foreign']);
export const MODULE_PATH = /\.[jt]sx?$/;

/**
 * Nodes that wrap the call without changing it. `as const` is its own node type
 * (`TsConstAssertion`, not `TsAsExpression`), which is exactly the kind of
 * difference that costs an island: the def is declared, the catalog never hears
 * about it, and a page whose islands all sit behind suspense ships no runtime.
 */
const WRAPPERS = new Set([
  'TsAsExpression',
  'TsSatisfiesExpression',
  'TsConstAssertion',
  'TsNonNullExpression',
  'ParenthesisExpression',
]);

/** Looks through every wrapper, however many were written. */
export function unwrap(node: any): any {
  return WRAPPERS.has(node?.type) ? unwrap(node.expression) : node;
}

/** The `name` of a `component({ ... })` / `foreign({ ... })` initializer, when statically written. */
function declaredName(init: any): string | undefined {
  const unwrapped = unwrap(init);

  if (unwrapped?.type !== 'CallExpression' || !DEF_FACTORIES.has(unwrapped.callee?.value)) return undefined;
  const config = unwrapped.arguments?.[0]?.expression;

  if (config?.type !== 'ObjectExpression') return undefined;
  const name = config.properties?.find((prop: any) => prop.type === 'KeyValueProperty' && prop.key?.value === 'name');

  return name?.value?.type === 'StringLiteral' ? name.value.value : undefined;
}

/** Defs are declared at module top level: `export const X = component({...})` (or a default export). */
function topLevelDeclarations(node: any): any[] {
  if (node.type === 'ExportDefaultExpression') return [{ init: node.expression }];
  const declaration = node.type === 'ExportDeclaration' ? node.declaration : node;

  return declaration?.type === 'VariableDeclaration' ? declaration.declarations : [];
}

/**
 * Island names a module declares. A missed island silently reintroduces the
 * suspense-only-page bug, so a parse failure retries with the other JSX mode
 * (JSX does appear in `.ts` files) before giving up on the module.
 */
export function islandNamesIn(code: string, tsx = false): string[] {
  const names = (parseTsx: boolean) => {
    const module = parseSync(code, { syntax: 'typescript', tsx: parseTsx });

    return module.body.flatMap(topLevelDeclarations).flatMap((decl: any) => declaredName(decl.init) ?? []);
  };

  try {
    return names(tsx);
  } catch {
    try {
      return names(!tsx);
    } catch {
      return [];
    }
  }
}

/**
 * Dev's answer to the build catalog: `janux dev` bundles nothing, so the
 * catalog is derived by scanning the app source on demand (same names, ''
 * URLs — defs ship inside the runtime graph). Without it a page whose only
 * islands sit behind suspense boundaries never boots under the dev server.
 */
export function islandCatalogFromDir(dir: string): Record<string, string> {
  const catalog: Record<string, string> = {};

  if (!existsSync(dir)) return catalog;
  readdirSync(dir, { recursive: true })
    .map((name) => join(dir, String(name)))
    .filter((file) => MODULE_PATH.test(file) && !file.includes('node_modules'))
    .forEach((file) => collectIslands(catalog, file, readFileSync(file, 'utf8')));

  return catalog;
}

/** Folds one bundled module into the catalog; dependencies and virtual modules are not the app's islands. */
export function collectIslands(catalog: Record<string, string>, id: string, code: string): void {
  const path = id.split('?')[0] ?? id;

  if (id.startsWith('\0') || id.includes('node_modules') || !MODULE_PATH.test(path)) return;
  if (!code.includes('component(') && !code.includes('foreign(')) return;
  islandNamesIn(code, path.endsWith('x')).forEach((name) => {
    catalog[name] = '';
  });
}
