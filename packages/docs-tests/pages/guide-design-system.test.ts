import { beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInstance, jsx, renderToString } from 'janux';
import { buildManifest } from 'janux/manifest';
import { docExample } from '../doc-example';

/**
 * guide/design-system.md is a stance, and a stance is only worth publishing if
 * its example runs. The page tells a reader to compose shadcn components in one
 * React file and wrap it ONCE in an island — so both fences are executed here,
 * chained exactly as the page chains them: the shell mounts the very SaveBar
 * the page documents, which in turn renders a shadcn-shaped `Button`.
 */

const PAGE = 'apps/docs/content/guide/design-system.md';
/** The shell imports the file the previous fence defines; `cn` and `cva` are not the claim. */
const SAVE_BAR = { "'./SaveBar'": "'./.apps__docs__content__guide__design-system-1.generated'" };
const BUTTON = { "'./ui/button'": "'./pages/__fixtures__/shadcn-button'" };

let Counter: any;
let SaveBarShell: any;

beforeAll(async () => {
  ({ Counter } = await docExample(PAGE, 0));
  await docExample(PAGE, 1, BUTTON); // generated first: the shell imports it
  ({ SaveBarShell } = await docExample(PAGE, 2, SAVE_BAR));
});

async function attached(def: any): Promise<any> {
  const instance = createInstance(def);

  await instance.attach();

  return instance;
}

describe('guide/design-system.md — most UI needs no library', () => {
  it('the documented button is a button, and it works', async () => {
    const counter = await attached(Counter);

    await counter.intents.increment();

    expect(counter.snapshot().count).toBe(1);
  });

  it('server-renders as markup with no island payload of its own', async () => {
    const { html } = await renderToString(jsx(Counter as any, {}), {});

    expect(html).toContain('<button class="btn"');
    expect(html).toContain('Clicked 0 times');
  });
});

describe('guide/design-system.md — shadcn through foreign()', () => {
  it('renders the composed React file on the server, inside the island', async () => {
    const { html } = await renderToString(jsx(SaveBarShell as any, {}), {});

    // The page promises paint before JS: the shadcn markup is in the HTML.
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('Save changes');
    expect(html).toContain('unsaved changes');
  });

  it('gives the agent the shell, never the component library', async () => {
    const instance = await attached(SaveBarShell);
    const manifest: any = buildManifest([{ def: SaveBarShell, key: 'default', instance }] as any, {});
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards).toEqual({ 'draft.save': 'auto', 'draft.discard': 'confirm' });
    expect(manifest.resources.map((resource: any) => resource.uri)).toEqual(['ui://draft']);
    // The foreign leaf is invisible, as the page states.
    expect(JSON.stringify(manifest)).not.toContain('save-bar');
  });

  it('drives the React tree from island state through the props mapper', async () => {
    const instance = await attached(SaveBarShell);

    await instance.intents.save(undefined, { origin: 'agent' });

    expect(instance.snapshot()).toMatchObject({ saved: true, dirty: false });
  });
});

describe('guide/design-system.md — the stance itself', () => {
  // A stance page fails by going vague, and nothing else in the repo breaks
  // when it does — so the two sentences that make it a decision are asserted.
  const markdown = readFileSync(resolve(import.meta.dir, '../../..', PAGE), 'utf8');

  it('answers the question without hedging', () => {
    expect(markdown).toContain('## Where do I get my buttons?');
    expect(markdown).toContain('**Janux ships no UI components, and is not going to.**');
  });

  it('keeps the pragma warning, which is the failure nobody debugs twice', () => {
    expect(markdown).toContain('@jsxImportSource react');
    expect(markdown).toContain('server-renders as an empty host');
  });
});
