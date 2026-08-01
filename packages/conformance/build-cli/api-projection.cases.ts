import { apiModuleName, apiStubModule, exportedApiNames } from '@janux/vite';
import type { Case } from '../support/case';

/**
 * The client projection of a server api module.
 *
 * `src/server/shop.api.ts` never reaches the browser: the Vite plugin replaces
 * it with one typed fetch stub per export. Which means the export list is a
 * *contract*, and anything the parser cannot see is an import that resolves to
 * `undefined` at runtime, in the browser, with no build error anywhere. So the
 * module shape is deliberately narrow, and everything outside it must be
 * refused loudly at build time rather than dropped quietly.
 */

export interface ExportsCase {
  code: string;
  /** The names that become stubs, in source order. */
  names: string[];
}

export type ExportsRow = Case<ExportsCase>;

export const EXPORTS_CASES: ExportsRow[] = [
  { id: 'build2-api-reads-one-exported-const', src: 'janux', code: 'export const list = api({});', names: ['list'] },
  { id: 'build2-api-reads-two-declarators-of-one-statement', src: 'janux', code: 'export const list = api({}), buy = api({});', names: ['list', 'buy'] },
  { id: 'build2-api-reads-consecutive-export-statements', src: 'janux', code: 'export const list = api({});\nexport const buy = api({});', names: ['list', 'buy'] },
  { id: 'build2-api-ignores-a-const-nobody-exported', src: 'janux', code: 'const helper = 1;\nexport const list = api({});', names: ['list'] },
  { id: 'build2-api-ignores-the-imports-the-module-needs', src: 'janux', code: "import { api } from '@janux/server';\nexport const list = api({});", names: ['list'] },
  { id: 'build2-api-projects-an-empty-module-to-no-stubs', src: 'janux', code: '', names: [] },
  { id: 'build2-api-looks-through-a-satisfies-annotation', src: 'janux', code: 'export const list = api({}) satisfies Tool;', names: ['list'] },
  { id: 'build2-api-reads-an-exported-let-the-same-way', src: 'janux', code: 'export let list = api({});', names: ['list'] },
  { id: 'build2-api-keeps-an-exported-type-alias-out-of-the-client', src: 'janux', code: 'export type Item = { id: string };\nexport const list = api({});', names: ['list'] },
  { id: 'build2-api-keeps-an-exported-interface-out-of-the-client', src: 'janux', code: 'export interface Item { id: string }\nexport const list = api({});', names: ['list'] },
  { id: 'build2-api-ignores-a-declaration-inside-a-function', src: 'janux', code: 'function make() { const inner = api({}); return inner; }', names: [] },
];

export interface RejectedExportCase {
  code: string;
  /** Substring the build error must carry, so the offending shape is named. */
  says: string;
}

export type RejectedExportRow = Case<RejectedExportCase>;

export const REJECTED_EXPORT_CASES: RejectedExportRow[] = [
  { id: 'build2-api-refuses-a-default-export-value', src: 'janux', code: 'const list = api({});\nexport default list;', says: 'ExportDefaultExpression' },
  { id: 'build2-api-refuses-a-default-exported-function', src: 'janux', code: 'export default function list() {}', says: 'ExportDefaultDeclaration' },
  { id: 'build2-api-refuses-an-export-list', src: 'janux', code: 'const list = api({});\nexport { list };', says: 'ExportNamedDeclaration' },
  { id: 'build2-api-refuses-a-re-export', src: 'janux', code: "export * from './other';", says: 'ExportAllDeclaration' },
  { id: 'build2-api-refuses-an-exported-function-declaration', src: 'janux', code: 'export function list() {}', says: 'FunctionDeclaration' },
  { id: 'build2-api-refuses-an-exported-class', src: 'janux', code: 'export class Shop {}', says: 'ClassDeclaration' },
  { id: 'build2-api-refuses-a-destructured-export', src: 'janux', code: 'export const { list } = tools;', says: 'destructured' },
  { id: 'build2-api-refuses-an-array-destructured-export', src: 'janux', code: 'export const [list] = tools;', says: 'destructured' },
];

export interface StubCase {
  filePath: string;
  code: string;
  /** Every line the generated client module must carry, in order. */
  lines: string[];
}

export type StubRow = Case<StubCase>;

const CLIENT_IMPORT = "import { clientApi } from 'janux/client';";

export const STUB_CASES: StubRow[] = [
  {
    id: 'build2-api-stub-namespaces-every-export-under-the-module-name',
    src: 'janux',
    filePath: '/app/src/server/shop.api.ts',
    code: 'export const list = api({});',
    lines: [CLIENT_IMPORT, 'export const list = clientApi("shop.list");'],
  },
  {
    id: 'build2-api-stub-emits-one-line-per-export',
    src: 'janux',
    filePath: '/app/src/server/shop.api.ts',
    code: 'export const list = api({});\nexport const buy = api({});',
    lines: [CLIENT_IMPORT, 'export const list = clientApi("shop.list");', 'export const buy = clientApi("shop.buy");'],
  },
  {
    id: 'build2-api-stub-still-imports-the-client-for-a-module-with-no-exports',
    src: 'janux',
    filePath: '/app/src/server/shop.api.ts',
    code: 'const unused = 1;',
    lines: [CLIENT_IMPORT],
  },
  {
    id: 'build2-api-stub-takes-the-namespace-from-a-javascript-module-too',
    src: 'janux',
    filePath: '/app/src/server/orders.api.js',
    code: 'export const list = api({});',
    lines: [CLIENT_IMPORT, 'export const list = clientApi("orders.list");'],
  },
];

export interface ModuleNameCase {
  filePath: string;
  name: string;
}

export type ModuleNameRow = Case<ModuleNameCase>;

export const MODULE_NAME_CASES: ModuleNameRow[] = [
  { id: 'build2-api-name-drops-the-typescript-suffix', src: 'janux', filePath: '/app/src/server/shop.api.ts', name: 'shop' },
  { id: 'build2-api-name-drops-the-javascript-suffix', src: 'janux', filePath: '/app/src/server/shop.api.js', name: 'shop' },
  { id: 'build2-api-name-is-taken-from-the-file-not-the-directory', src: 'janux', filePath: '/app/src/server/nested/shop.api.ts', name: 'shop' },
  { id: 'build2-api-name-keeps-the-dots-a-module-name-carries', src: 'janux', filePath: '/app/src/server/my.shop.api.ts', name: 'my.shop' },
  { id: 'build2-api-name-strips-only-the-trailing-suffix', src: 'janux', filePath: '/app/src/server/x.api.y.api.ts', name: 'x.api.y' },
];

/** Re-exported so the runner does not import the plugin twice. */
export { apiModuleName, apiStubModule, exportedApiNames };
