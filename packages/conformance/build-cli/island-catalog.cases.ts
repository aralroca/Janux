import { collectIslands, islandNamesIn } from '../../janux-vite/src/islands';
import type { Case } from '../support/case';

/**
 * The island catalog a build emits, read straight off the source.
 *
 * The catalog exists because a page whose only islands sit behind suspense
 * boundaries has an empty SSR registry when the streaming interlude flushes:
 * without the catalog, production decides the page needs no runtime and the
 * page never boots. So a missed island is not a missing optimisation, it is a
 * dead page — and the ways to miss one are all syntactic, which is why they are
 * pinned down here one by one.
 */

export interface IslandNamesCase {
  code: string;
  /** Whether the module is parsed as `.tsx` first. */
  tsx?: boolean;
  names: string[];
}

export type IslandNamesRow = Case<IslandNamesCase>;

export const ISLAND_NAMES_CASES: IslandNamesRow[] = [
  { id: 'build2-island-reads-a-component-definition', src: 'janux', code: "export const Counter = component({ name: 'counter' });", names: ['counter'] },
  { id: 'build2-island-reads-a-foreign-definition', src: 'janux', code: "export const Chart = foreign({ name: 'chart' });", names: ['chart'] },
  { id: 'build2-island-looks-through-an-as-const-assertion', src: 'janux', code: "export const Counter = component({ name: 'counter' }) as const;", names: ['counter'] },
  { id: 'build2-island-looks-through-a-type-assertion', src: 'janux', code: "export const Counter = component({ name: 'counter' }) as Island;", names: ['counter'] },
  { id: 'build2-island-looks-through-a-satisfies-annotation', src: 'janux', code: "export const Counter = component({ name: 'counter' }) satisfies Island;", names: ['counter'] },
  { id: 'build2-island-looks-through-parentheses', src: 'janux', code: "export const Counter = (component({ name: 'counter' }));", names: ['counter'] },
  { id: 'build2-island-looks-through-a-non-null-assertion', src: 'janux', code: "export const Counter = component({ name: 'counter' })!;", names: ['counter'] },
  { id: 'build2-island-reads-a-default-exported-definition', src: 'janux', code: "export default component({ name: 'counter' });", names: ['counter'] },
  { id: 'build2-island-reads-a-definition-that-is-never-exported', src: 'janux', code: "const Counter = component({ name: 'counter' });", names: ['counter'] },
  { id: 'build2-island-reads-two-declarators-of-one-statement', src: 'janux', code: "export const A = component({ name: 'a' }), B = component({ name: 'b' });", names: ['a', 'b'] },
  { id: 'build2-island-finds-the-name-wherever-it-sits-in-the-config', src: 'janux', code: "export const Counter = component({ hydrate: 'idle', name: 'counter' });", names: ['counter'] },
  { id: 'build2-island-reads-a-name-beside-a-spread', src: 'janux', code: "export const Counter = component({ ...base, name: 'counter' });", names: ['counter'] },
  { id: 'build2-island-cannot-name-a-computed-definition', src: 'janux', code: 'export const Counter = component({ name: NAME });', names: [] },
  { id: 'build2-island-cannot-name-a-template-literal', src: 'janux', code: 'export const Counter = component({ name: `counter` });', names: [] },
  { id: 'build2-island-cannot-name-a-shorthand-property', src: 'janux', code: 'export const Counter = component({ name });', names: [] },
  { id: 'build2-island-ignores-a-definition-with-no-name-at-all', src: 'janux', code: 'export const Counter = component({});', names: [] },
  { id: 'build2-island-ignores-a-factory-that-is-not-ours', src: 'janux', code: "export const Counter = island({ name: 'counter' });", names: [] },
  { id: 'build2-island-ignores-a-method-that-happens-to-be-called-component', src: 'janux', code: "export const Counter = ui.component({ name: 'counter' });", names: [] },
  { id: 'build2-island-ignores-a-definition-built-inside-a-function', src: 'janux', code: "function make() { return component({ name: 'counter' }); }", names: [] },
  { id: 'build2-island-parses-jsx-that-turned-up-in-a-ts-file', src: 'janux', code: "export const Counter = component({ name: 'counter', render: () => <b>1</b> });", tsx: false, names: ['counter'] },
  { id: 'build2-island-gives-up-on-a-module-it-cannot-parse', src: 'janux', code: 'export const = ;', names: [] },
  { id: 'build2-island-has-nothing-to-read-in-a-module-that-declares-nothing', src: 'janux', code: '// islands live elsewhere\n', names: [] },
];

export interface CatalogCase {
  /** The module id the bundler handed the plugin. */
  moduleId: string;
  code: string;
  /** `true` when the module contributes its islands to the catalog. */
  collected: boolean;
}

export type CatalogRow = Case<CatalogCase>;

export const CATALOG_CASES: CatalogRow[] = [
  { id: 'build2-catalog-collects-an-app-module', src: 'janux', moduleId: '/app/src/counter.tsx', code: "export const A = component({ name: 'a' });", collected: true },
  { id: 'build2-catalog-collects-a-module-behind-a-vite-query', src: 'janux', moduleId: '/app/src/counter.tsx?used', code: "export const A = component({ name: 'a' });", collected: true },
  { id: 'build2-catalog-collects-from-a-plain-ts-module', src: 'janux', moduleId: '/app/src/counter.ts', code: "export const A = component({ name: 'a' });", collected: true },
  { id: 'build2-catalog-skips-a-virtual-module', src: 'janux', moduleId: '\0virtual:counter.tsx', code: "export const A = component({ name: 'a' });", collected: false },
  { id: 'build2-catalog-skips-a-dependency', src: 'janux', moduleId: '/app/node_modules/ui/counter.tsx', code: "export const A = component({ name: 'a' });", collected: false },
  { id: 'build2-catalog-skips-a-file-that-is-not-a-module', src: 'janux', moduleId: '/app/src/counter.css', code: "export const A = component({ name: 'a' });", collected: false },
  { id: 'build2-catalog-skips-a-module-that-defines-no-island', src: 'janux', moduleId: '/app/src/helpers.ts', code: 'export const A = 1;', collected: false },
  { id: 'build2-catalog-skips-a-module-that-only-mentions-the-word', src: 'janux', moduleId: '/app/src/notes.ts', code: '// component is the unit of composition\nexport const A = 1;', collected: false },
];

/** Every island in the catalog maps to `''`: the def ships inside the runtime bundle. */
export const CATALOG_URL = '';

/** Re-exported so the runner does not import the plugin twice. */
export { collectIslands, islandNamesIn };
