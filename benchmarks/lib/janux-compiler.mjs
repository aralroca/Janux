/**
 * The shipped binding-maps compiler for the janux fixtures, the way the
 * Solid/Svelte/Vapor fixtures ship their compilers. Relative on purpose:
 * the harnesses load fixture vite configs under Node, and the workspace
 * @janux/vite ships TS sources Node cannot resolve — Vite's config loader
 * bundles relative imports (TS included), leaving @swc/core external.
 */
export { januxCompiler } from '../../packages/janux-vite/src/compiler-plugin';
