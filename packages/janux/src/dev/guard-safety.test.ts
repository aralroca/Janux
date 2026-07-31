import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from '@swc/core';
import { describe, expect, it } from 'bun:test';

/**
 * `import.meta.env` is Vite's, and only Vite's. Node leaves it `undefined`, so
 * a bare `import.meta.env.DEV` throws `Cannot read properties of undefined` the
 * moment it evaluates — and these guards sit in `createInstance` and
 * `invokeIntent`, which run during SSR as well as in the browser. A published
 * package is transpiled per file, not bundled, so the expression reaches a
 * consumer's runtime exactly as written here.
 *
 * `import.meta.env?.DEV` is both: undefined-safe off Vite, and still folded to
 * `false` and tree-shaken by a production build — measured in
 * `packages/janux-cli/src/bundle-size.test.ts`.
 */

/** Runtime modules that evaluate on the server as well as in the browser. */
const GUARDED_FILES = ['runtime/instance.ts', 'runtime/intents.ts', 'client/boot.ts'];

/** Every `import.meta` in the file, paired with whether it is reached optionally. */
function metaAccesses(code: string): { optional: boolean }[] {
  const found: { optional: boolean }[] = [];
  const walk = (node: any, optional: boolean): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'MetaProperty' || node.type === 'ImportMeta') found.push({ optional });
    const inside = optional || node.type === 'OptionalChainingExpression';

    Object.values(node).forEach((child) =>
      Array.isArray(child) ? child.forEach((item) => walk(item, inside)) : walk(child, inside),
    );
  };

  walk(parseSync(code, { syntax: 'typescript', target: 'esnext' }), false);

  return found;
}

describe('the dev guards in shared runtime modules', () => {
  GUARDED_FILES.forEach((file) => {
    it(`reads import.meta.env optionally in ${file}, so Node cannot throw on it`, () => {
      const accesses = metaAccesses(readFileSync(join(import.meta.dir, '..', file), 'utf8'));

      expect(accesses.length).toBeGreaterThan(0);
      expect(accesses.every((access) => access.optional)).toBe(true);
    });
  });
});
