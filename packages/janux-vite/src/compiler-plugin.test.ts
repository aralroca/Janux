import { describe, expect, it } from 'bun:test';
import { januxCompiler } from './compiler-plugin';

const ISLAND = `import { component, schema, int } from 'janux';
export const Counter = component({ name: 'counter', state: schema({ n: int() }), view: ({ state }: any) => <b>{state.n}</b> });
`;

/** The standalone compiler plugin: same transform as janux(), zero app config. */
describe('januxCompiler', () => {
  it('compiles client modules and leaves the SSR graph alone', async () => {
    const plugin: any = januxCompiler();

    expect((await plugin.transform.call({}, ISLAND, '/app/src/Counter.tsx', undefined))?.code).toContain(
      '{() => (state.n)}',
    );
    expect(await plugin.transform.call({}, ISLAND, '/app/src/Counter.tsx', { ssr: true })).toBeUndefined();
    expect(await plugin.transform.call({}, 'export const x = 1;\n', '/app/src/x.ts', undefined)).toBeUndefined();
  });
});
