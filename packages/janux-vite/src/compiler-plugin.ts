import type { Plugin } from 'vite';
import { compileClientModule } from './binding-sites';

/**
 * The binding-maps compiler alone, with none of the app machinery. Internal
 * infrastructure for the benchmark fixtures (via benchmarks/lib), which
 * build their own entries but must still measure the shipped compiler,
 * exactly as the Solid/Svelte/Vapor fixtures measure theirs. Deliberately
 * not in the package exports: an app gets the same transform from `janux()`,
 * and promoting this to public API is a docs-and-exports decision, not a
 * side effect.
 */
export function januxCompiler(): Plugin {
  return {
    name: 'janux-compiler',

    transform(code, id, transformOptions) {
      if (transformOptions?.ssr) return undefined;
      const compiled = compileClientModule(id, code);

      return compiled ? { code: compiled, map: null } : undefined;
    },
  };
}
