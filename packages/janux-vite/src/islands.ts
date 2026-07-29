import { parseSync } from '@swc/core';

/**
 * The island catalog a client build emits (`islands.json` beside `client.js`):
 * island name → module URL, '' meaning the def ships inside the runtime
 * bundle. A page whose only islands sit behind suspense boundaries has an
 * empty SSR registry when the streaming interlude flushes — the catalog is how
 * production still knows the runtime must ship (`ServerOptions.islandModules`).
 */

const DEF_FACTORIES = new Set(['component', 'foreign']);
const MODULE_PATH = /\.[jt]sx?$/;

/** The `name` of a `component({ ... })` / `foreign({ ... })` initializer, when statically written. */
function declaredName(init: any): string | undefined {
  // `component({...}) as const` / `satisfies X` wrap the call — look through.
  const unwrapped = init?.type === 'TsAsExpression' || init?.type === 'TsSatisfiesExpression' ? init.expression : init;

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

/** Folds one bundled module into the catalog; dependencies and virtual modules are not the app's islands. */
export function collectIslands(catalog: Record<string, string>, id: string, code: string): void {
  const path = id.split('?')[0] ?? id;

  if (id.startsWith('\0') || id.includes('node_modules') || !MODULE_PATH.test(path)) return;
  if (!code.includes('component(') && !code.includes('foreign(')) return;
  islandNamesIn(code, path.endsWith('x')).forEach((name) => {
    catalog[name] = '';
  });
}
