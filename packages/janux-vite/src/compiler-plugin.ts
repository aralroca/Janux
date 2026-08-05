import type { Plugin } from 'vite';
import { compileClientModule } from './binding-sites';

/**
 * The binding-maps compiler alone, with none of the app machinery — for
 * toolchains that are not a full Janux app (the benchmark fixtures build
 * their own entries but must still measure the shipped compiler, exactly as
 * the Solid/Svelte/Vapor fixtures measure theirs). `janux()` embeds the same
 * transform; an app never needs both.
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
