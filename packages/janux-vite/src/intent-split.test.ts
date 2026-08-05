import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { build } from 'vite';
import { extractIntentRun, intentVirtualId, parseIntentVirtualId, splitIntentsTransform } from './intent-split';
import { janux } from './plugin';

/**
 * Per-intent code splitting (the roadmap's compiler evolution, second
 * half): an intent's `run()` moves to its own module, loaded on first
 * invocation — the stub left behind keeps `instance.intents[name]`'s shape,
 * so the wire format, guards, schemas and the manifest never notice. Only a
 * run the analysis can PROVE self-contained moves: free identifiers must
 * all be imports of the module (or harmless globals), and no inner
 * declaration may collide with a module-scope name (the shadowing hole).
 */

const HEADER = `import { component, intent, schema, str } from 'janux';\nimport { track } from './analytics';\n`;

function island(intents: string): string {
  return `${HEADER}export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: {
    ${intents}
  },
  view: () => null,
});\n`;
}

describe('splitIntentsTransform', () => {
  it('replaces a provably self-contained run with a lazy stub', () => {
    const code = island(`save: intent({
      description: 'Persist the note',
      run: async ({ state, input }: any) => {
        await track('save');
        state.note = String(input.note);
      },
    }),`);
    const out = splitIntentsTransform(code, true, '/app/src/Cart.tsx')!;

    expect(out).toContain(`import(${JSON.stringify(intentVirtualId('/app/src/Cart.tsx', 'cart', 'save'))})`);
    expect(out).not.toContain("track('save')");
    // Everything but the run stays: description, schema, guard surface.
    expect(out).toContain("description: 'Persist the note'");
  });

  it('leaves a run that reads module-local state inline', () => {
    const code = `${HEADER}let calls = 0;
export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { bump: intent({ run: () => { calls += 1; } }) },
  view: () => null,
});\n`;

    expect(splitIntentsTransform(code, true, '/app/src/Cart.tsx')).toBeUndefined();
  });

  it('leaves a run whose inner declarations collide with module names', () => {
    const code = island(`save: intent({
      run: ({ state }: any) => { const track = (x: any) => x; state.note = track('x'); },
    }),`);

    expect(splitIntentsTransform(code, true, '/app/src/Cart.tsx')).toBeUndefined();
  });

  it('allows harmless globals and TS annotations', () => {
    const code = island(`save: intent({
      run: ({ state, input }: any): void => {
        const parsed: { note?: string } = JSON.parse(String(input.raw));
        state.note = parsed.note ?? Math.random().toString();
      },
    }),`);

    expect(splitIntentsTransform(code, true, '/app/src/Cart.tsx')).toContain('import(');
  });

  /**
   * A global name is only an excuse when NOTHING in the module binds it: a
   * module-scope `const fetch` wrapper must block extraction, and an
   * imported `Headers` polyfill must travel with the chunk — never be
   * silently swapped for the platform global.
   */
  it('never rebinds a module-shadowed or imported global', () => {
    const shadowed = `${HEADER}const fetch = (u: string) => globalThis.fetch('/api' + u);
export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { go: intent({ run: async ({ state }: any) => { state.note = await fetch('/x'); } }) },
  view: () => null,
});\n`;
    const polyfilled = `${HEADER}import { Headers } from './polyfill';
export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { go: intent({ run: ({ state }: any) => { state.note = String(new Headers({})); } }) },
  view: () => null,
});\n`;

    expect(splitIntentsTransform(shadowed, true, '/app/src/Cart.tsx')).toBeUndefined();
    expect(extractIntentRun(polyfilled, true, 'cart', 'go')).toContain("import { Headers } from './polyfill';");
  });

  /** `<T>expr` is the one Ts*Type* node with a runtime child — its reference must be seen. */
  it('carries imports referenced through a TsTypeAssertion', () => {
    const code = `import { component, intent, schema, str } from 'janux';
import { cfg } from './cfg';
export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { go: intent({ run: ({ state }: any) => { state.note = <string>cfg; } }) },
  view: () => null,
});\n`;

    expect(extractIntentRun(code, false, 'cart', 'go')).toContain("import { cfg } from './cfg';");
  });

  /** Two defs sharing an island name would collapse onto one virtual id — split neither. */
  it('does not split duplicate island/intent pairs', () => {
    const code = `${HEADER}export const A = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { go: intent({ run: ({ state }: any) => void (state.note = 'a') }) },
  view: () => null,
});
export const B = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { go: intent({ run: ({ state }: any) => void (state.note = 'b') }) },
  view: () => null,
});\n`;

    expect(splitIntentsTransform(code, true, '/app/src/Cart.tsx')).toBeUndefined();
  });

  it('leaves referenced (non-inline) intents and non-function runs alone', () => {
    const referenced = `${HEADER}const saveDef = intent({ run: ({ state }: any) => void (state.note = 'x') });
export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: { save: saveDef },
  view: () => null,
});\n`;

    expect(splitIntentsTransform(referenced, true, '/app/src/Cart.tsx')).toBeUndefined();
  });
});

/**
 * The whole pipeline through a real client build: the run body (and the
 * helper only it imports) land in their own chunk; the entry chunk keeps
 * the stub and the rest of the def. First invocation is what downloads it.
 */
describe('janux build with splitIntents', () => {
  it('emits the run as its own lazily-imported chunk', async () => {
    const root = join(import.meta.dirname, '__fixtures__/split-app');
    const outDir = mkdtempSync(join(tmpdir(), 'janux-split-'));

    await build({
      root,
      logLevel: 'error',
      plugins: [janux({ compiler: { splitIntents: true } })],
      build: { outDir, emptyOutDir: true, rollupOptions: { input: { client: join(root, 'src/client.ts') } } },
    });
    const assets = join(outDir, 'assets');
    const chunks = readdirSync(assets)
      .filter((file) => file.endsWith('.js'))
      .map((file) => [file, readFileSync(join(assets, file), 'utf8')] as const);
    const withRun = chunks.filter(([, code]) => code.includes('saved:'));
    const entry = chunks.find(([, code]) => code.includes('Persist the note'));

    expect(withRun.length).toBe(1);
    expect(entry).toBeDefined();
    expect(entry![0]).not.toBe(withRun[0]![0]);
    // The def in the entry keeps everything but the run, and imports lazily.
    expect(entry![1]).not.toContain('saved:');
    expect(entry![1]).toContain('import(');
  });
});

describe('the virtual intent module', () => {
  it('round-trips its id and carries the run plus only the imports it needs', () => {
    const id = intentVirtualId('/app/src/Cart.tsx', 'cart', 'save');
    const parsed = parseIntentVirtualId(`\0${id}`)!;

    expect(parsed).toEqual({ module: '/app/src/Cart.tsx', island: 'cart', intent: 'save' });
    const code = island(`save: intent({
      run: async ({ state, input }: any) => {
        await track('save');
        state.note = String(input.note);
      },
    }),`);
    const virtual = extractIntentRun(code, true, 'cart', 'save')!;

    expect(virtual).toContain("import { track } from './analytics';");
    expect(virtual).not.toContain("from 'janux'");
    expect(virtual).toContain('export const run =');
    expect(virtual).toContain("track('save')");
  });
});
