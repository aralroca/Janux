import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'bun:test';
import { compileBindingSites } from './binding-sites';

/**
 * The whole pipeline, differentially: one module source, shipped as written
 * and shipped compiled, must render byte-identical HTML. The temp modules
 * live inside this package so 'janux' resolves for them, exactly as it would
 * for an app module Vite transformed.
 */

const SOURCE = `import { component, schema, str, int, obj } from 'janux';

export const Card = component({
  name: 'parity-card',
  state: schema({
    count: int().default(3),
    tone: str().default('warm'),
    user: obj({ name: str().default('ada') }),
  }),
  view: ({ state }: any) => (
    <section data-tone={state.tone} class="card">
      <b>{state.user.name}</b>
      <span>{state.count}</span>
    </section>
  ),
});
`;

const dir = mkdtempSync(join(import.meta.dirname, '.parity-'));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function loadVariant(name: string, code: string): Promise<any> {
  const transpiler = new Bun.Transpiler({
    loader: 'tsx',
    autoImportJSX: true,
    tsconfig: { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'janux' } } as any,
  });
  const file = join(dir, `${name}.mjs`);

  writeFileSync(file, transpiler.transformSync(code));

  return (await import(pathToFileURL(file).href)).Card;
}

describe('compiled and original modules render identical HTML', () => {
  it('resolves every compiled thunk server-side to the bytes the original wrote', async () => {
    const compiled = compileBindingSites(SOURCE, true);

    expect(compiled).toContain('() => (state.count)');
    const { renderToString } = await import('janux/server');
    const original = await loadVariant('original', SOURCE);
    const evolved = await loadVariant('compiled', compiled!);
    // `<>&"` in state: escaping must survive the thunk hop identically.
    const state = { count: 5, tone: 'a"b<c>&d', user: { name: '<i>&amp;' } };
    const html = async (def: any) => (await renderToString(def.view({ state }))).html;

    const originalHtml = await html(original);

    expect(await html(evolved)).toBe(originalHtml);
    expect(originalHtml).toContain('class="card"');
    expect(originalHtml).toContain('<span>5</span>');
  });
});
