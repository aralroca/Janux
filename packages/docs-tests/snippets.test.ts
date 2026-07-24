import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Docs-truth harness: every ts/tsx code block in the documentation must
 * (a) compile, (b) import only resolvable modules, and (c) import only
 * symbols those modules actually export. If a doc example rots, this fails.
 */

const ROOT = resolve(import.meta.dir, '../..');
const SOURCES = [join(ROOT, 'README.md'), join(ROOT, 'apps/docs/content'), join(ROOT, 'examples')];

interface Snippet {
  file: string;
  index: number;
  lang: string;
  code: string;
}

function mdFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];

  return readdirSync(path, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.md') && !name.includes('node_modules'))
    .map((name) => join(path, name));
}

function snippetsOf(file: string): Snippet[] {
  // Flags after the language (```tsx live) must not hide a fence from the compiler.
  const blocks = [...readFileSync(file, 'utf8').matchAll(/```(tsx?|jsx?)(?:[ \t]+[^\n]*)?\n([\s\S]*?)```/g)];

  return blocks.map((match, index) => ({
    file: file.slice(ROOT.length + 1),
    index,
    lang: match[1]!,
    code: match[2]!,
  }));
}

const snippets = SOURCES.flatMap(mdFiles).flatMap(snippetsOf);
const transpiler = new Bun.Transpiler({ loader: 'tsx' });

/**
 * Docs show three snippet shapes: full modules, object-literal fragments
 * (e.g. an `intents:` entry) and statement fragments. A snippet passes if any
 * of those readings compiles.
 */
/** Docs use `...` ellipses and repeated-alternative exports on purpose — normalize to valid stand-ins. */
function normalize(code: string): string {
  let seq = 0;

  return code
    .replace(/\{\s*\.\.\.\s*\}/g, '{}')
    .replace(/\[\s*\.\.\.\s*\]/g, '[]')
    .replace(/:\s*\.\.\.\s*(,?)$/gm, ': undefined$1')
    .replace(/^\s*(\.\.\.|…)\s*$/gm, '')
    .replace(/^export const (\w+) = /gm, (match, name) => `export const ${name}__${seq++} = `);
}

function compiles(raw: string): boolean {
  const code = normalize(raw);
  const imports = code.match(/^import[^;]+;$/gm)?.join('\n') ?? '';
  const body = imports ? code.replace(/^import[^;]+;$/gm, '') : code;
  const readings = [
    code,
    `const __doc = {\n${code}\n};`,
    `async function __doc() {\n${code}\n}`,
    `const __doc = <>\n${code}\n</>;`,
    `${imports}\nconst __doc = {\n${body}\n};`,
  ];

  return readings.some((reading) => {
    try {
      transpiler.transformSync(reading);

      return true;
    } catch {
      return false;
    }
  });
}

/** Package imports only — relative/app-alias imports refer to the reader's app. */
function packageImports(code: string): { specifier: string; names: string[] }[] {
  const statements = [...code.matchAll(/^import\s+(type\s+)?(\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+'([^']+)'/gm)];

  return statements
    .filter(([, , , specifier]) => /^(janux|@janux\/)/.test(specifier!))
    .map(([, typeOnly, clause, specifier]) => ({
      specifier: specifier!,
      names:
        typeOnly || !clause!.startsWith('{')
          ? []
          : clause!
              .slice(1, -1)
              .split(',')
              .map((name) => name.trim())
              .filter((name) => !name.startsWith('type '))
              .map((name) => name.split(/\s+as\s+/)[0]!)
              .filter((name) => name.length > 0),
    }));
}

describe(`documentation code blocks (${snippets.length})`, () => {
  it('found a meaningful number of snippets', () => {
    expect(snippets.length).toBeGreaterThan(40);
  });

  for (const snippet of snippets) {
    it(`${snippet.file} #${snippet.index} compiles`, () => {
      expect(compiles(snippet.code)).toBe(true);
    });
  }
});

describe('documented imports resolve and export what the docs claim', () => {
  const claims = new Map<string, Set<string>>();

  for (const snippet of snippets) {
    for (const { specifier, names } of packageImports(snippet.code)) {
      const set = claims.get(specifier) ?? new Set();

      names.forEach((name) => set.add(name));
      claims.set(specifier, set);
    }
  }

  for (const [specifier, names] of claims) {
    it(`'${specifier}' exports ${[...names].join(', ') || '(default/namespace)'}`, async () => {
      const mod = await import(specifier);

      for (const name of names) expect(mod, `missing export "${name}"`).toHaveProperty(name);
    });
  }
});
