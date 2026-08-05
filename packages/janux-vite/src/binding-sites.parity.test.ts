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

const SOURCE = `import { component, schema, str, int, bool, obj } from 'janux';

export const Card = component({
  name: 'parity-card',
  state: schema({
    count: int().default(3),
    tone: str().default('warm'),
    on: bool().default(false),
    note: str().optional(),
    user: obj({ name: str().default('ada') }),
  }),
  view: ({ state }: any) => (
    <section data-tone={state.tone} class="card" hidden={state.on} aria-busy={state.on} data-note={state.note}>
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
    // `<>&"` in state: escaping must survive the thunk hop identically. The
    // boolean and the absent optional exercise the lax attribute gate.
    const states = [
      { count: 5, tone: 'a"b<c>&d', on: false, user: { name: '<i>&amp;' } },
      { count: 0, tone: '', on: true, note: 'kept', user: { name: 'ada' } },
    ];
    const html = async (def: any, state: unknown) => (await renderToString(def.view({ state }))).html;

    for (const state of states) {
      expect(await html(evolved, state)).toBe(await html(original, state));
    }
    const visible = await html(original, states[0]);

    expect(visible).toContain('class="card"');
    expect(visible).toContain('<span>5</span>');
    expect(visible).not.toContain('hidden');
    expect(await html(original, states[1])).toContain('aria-busy="true"');
  });
});
