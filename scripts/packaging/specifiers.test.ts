/**
 * Node resolves `./foo` in a package only if the file is literally `./foo`, so
 * every relative specifier the compiler leaves extensionless has to grow one —
 * in the `.d.ts` files too, where an extensionless import is what makes a
 * consumer on `moduleResolution: nodenext` see errors inside `node_modules`.
 */
import { describe, expect, test } from 'bun:test';
import { rewriteSpecifiers } from './specifiers';

/** Stands in for the filesystem: what the build knows exists next to the file. */
const files = new Set(['./sibling.js', './dir/index.js', './deep/nested.js']);
const resolve = (specifier: string) => (files.has(`${specifier}.js`) ? `${specifier}.js` : files.has(`${specifier}/index.js`) ? `${specifier}/index.js` : undefined);

function rewrite(code: string, dts = false): string {
  return rewriteSpecifiers(code, { resolve, dts });
}

describe('rewriteSpecifiers', () => {
  test('extends a sibling module', () => {
    expect(rewrite(`import a from './sibling';\n`)).toBe(`import a from './sibling.js';\n`);
  });

  test('extends a directory to its index', () => {
    expect(rewrite(`import a from './dir';\n`)).toBe(`import a from './dir/index.js';\n`);
  });

  test('rewrites re-exports and star exports', () => {
    expect(rewrite(`export { a } from './sibling';\nexport * from './dir';\n`)).toBe(
      `export { a } from './sibling.js';\nexport * from './dir/index.js';\n`,
    );
  });

  test('rewrites dynamic imports, wherever they sit', () => {
    expect(rewrite(`async function load() {\n  return (await import('./deep/nested')).x;\n}\n`)).toBe(
      `async function load() {\n  return (await import('./deep/nested.js')).x;\n}\n`,
    );
  });

  test('rewrites bare side-effect imports', () => {
    expect(rewrite(`import './sibling';\n`)).toBe(`import './sibling.js';\n`);
  });

  test('leaves bare and absolute specifiers alone', () => {
    const code = `import { join } from 'node:path';\nimport x from 'janux/client';\nimport y from 'https://esm.sh/x';\n`;

    expect(rewrite(code)).toBe(code);
  });

  test('leaves an already-extended specifier alone', () => {
    expect(rewrite(`import a from './sibling.js';\n`)).toBe(`import a from './sibling.js';\n`);
  });

  test('rewrites the import types tsc emits into declarations', () => {
    expect(rewrite(`export declare const x: import('./dir').Thing;\n`, true)).toBe(
      `export declare const x: import('./dir/index.js').Thing;\n`,
    );
  });

  test('keeps the original quote style', () => {
    expect(rewrite(`import a from "./sibling";\n`)).toBe(`import a from "./sibling.js";\n`);
  });

  // Spans come back from SWC as byte offsets; a multi-byte character before the
  // specifier shifts them past it if they are used as string indices.
  test('survives non-ASCII source', () => {
    expect(rewrite(`const label = '✔ hecho';\nimport a from './sibling';\n`)).toBe(
      `const label = '✔ hecho';\nimport a from './sibling.js';\n`,
    );
  });

  // A file that opens with a comment is the common case in this repo, and SWC
  // starts the Program span at the first statement rather than at byte 0 — so a
  // span read as an absolute offset lands in the middle of the comment.
  test('splices past a leading comment, not into it', () => {
    const code = `// Ported from Brisa's transCore (c) 2024, see CREDITS.md.\n// Second line.\nimport a from './sibling';\n`;

    expect(rewrite(code)).toBe(code.replace(`'./sibling'`, `'./sibling.js'`));
  });

  // The specifier's own text, quoted, inside the comment above it: every literal
  // then sits correctly at the *wrong* base too, so agreeing with itself proves
  // nothing and the only edit lands in the prose.
  test('splices past a comment that quotes the specifier itself', () => {
    const code = `/** Re-exported from './sibling' for convenience. */\nimport a from './sibling';\n`;

    expect(rewrite(code)).toBe(`/** Re-exported from './sibling' for convenience. */\nimport a from './sibling.js';\n`);
  });

  test('splices past a shebang', () => {
    const code = `#!/usr/bin/env bun\nimport a from './sibling';\n`;

    expect(rewrite(code)).toBe(`#!/usr/bin/env bun\nimport a from './sibling.js';\n`);
  });

  test('splices past a leading block comment', () => {
    const code = `/**\n * Doc block.\n */\nimport a from './dir';\nimport b from './sibling';\n`;

    expect(rewrite(code)).toBe(code.replace(`'./dir'`, `'./dir/index.js'`).replace(`'./sibling'`, `'./sibling.js'`));
  });

  test('reports a relative specifier it cannot resolve', () => {
    expect(() => rewrite(`import a from './missing';\n`)).toThrow(/\.\/missing/);
  });

  test('rewrites more than one specifier on the same line', () => {
    expect(rewrite(`import a from './sibling'; import b from './dir';\n`)).toBe(
      `import a from './sibling.js'; import b from './dir/index.js';\n`,
    );
  });
});
