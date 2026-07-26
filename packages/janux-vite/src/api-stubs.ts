import { parseSync } from '@swc/core';
import { apiModuleName } from './app-config';

const UNSUPPORTED_EXPORTS = new Set([
  'ExportDefaultDeclaration',
  'ExportDefaultExpression',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

function assertSupportedExport(node: any): void {
  if (UNSUPPORTED_EXPORTS.has(node.type)) {
    throw new Error(
      `Janux: *.api.ts modules only support \`export const name = api({...})\` — found ${node.type}`,
    );
  }
  if (node.type !== 'ExportDeclaration') return;
  if (node.declaration?.type?.startsWith('Ts')) return;
  if (node.declaration?.type !== 'VariableDeclaration') {
    throw new Error(
      `Janux: *.api.ts modules only support \`export const name = api({...})\` — found exported ${node.declaration?.type}`,
    );
  }
  node.declaration.declarations.forEach((declaration: any) => {
    if (declaration.id?.type !== 'Identifier') {
      throw new Error('Janux: destructured exports are not supported in *.api.ts modules');
    }
  });
}

/** Extracts exported const names from a `*.api.ts` module using SWC (no Babel). */
export function exportedApiNames(code: string): string[] {
  const module = parseSync(code, { syntax: 'typescript', tsx: false });

  return module.body.flatMap((node: any) => {
    assertSupportedExport(node);
    if (node.type !== 'ExportDeclaration') return [];
    if (node.declaration?.type !== 'VariableDeclaration') return [];

    return node.declaration.declarations.map((declaration: any) => declaration.id.value);
  });
}

// Re-exported from where it now lives: a production server needs the name of an
// api module, and importing this file for it would hand it @swc/core too.
export { apiModuleName };

/**
 * Client projection of a server api module: every export becomes a typed
 * fetch stub. Server code never reaches the browser bundle (RFC §7.1).
 */
export function apiStubModule(filePath: string, code: string): string {
  const moduleName = apiModuleName(filePath);
  const stubs = exportedApiNames(code)
    .map((name) => `export const ${name} = clientApi(${JSON.stringify(`${moduleName}.${name}`)});`)
    .join('\n');

  return `import { clientApi } from 'janux/client';\n${stubs}\n`;
}
