import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { component, intent, store } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, list, schema, str, enums } from '../schema';
import { renderToString } from '../render/server';
import { boot } from './boot';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/' }));
afterAll(() => GlobalRegistrator.unregister());

const counterDetach = mock(() => {});

const theme = store({
  name: 'theme',
  state: schema({ mode: enums(['dark', 'light']) }),
  intents: { toggle: intent({ run: ({ state }: any) => (state.mode = 'light') }) },
});

const counter = component({
  name: 'counter',
  state: schema({ n: int() }),
  lifecycle: { detach: counterDetach },
  intents: { inc: intent({ run: ({ state }: any) => (state.n += 1) }) },
  view: ({ state, intents }: any) =>
    jsx('div', { children: [jsx('output', { children: String(state.n) }), jsx('button', { on: intents.inc, children: '+' })] }),
});

const chat = component({
  name: 'chat',
  state: schema({ messages: list({ text: str() }) }),
  intents: {
    add: intent({ input: schema({ text: str() }), run: ({ state, input }: any) => state.messages.push(input) }),
  },
  view: ({ state }: any) => jsx('ul', { children: state.messages.map((m: any, i: number) => jsx('li', { key: String(i), children: m.text })) }),
});

const editorAttach = mock(() => {});
const editorDetach = mock(() => {});

const editor = component({
  name: 'editor',
  lifecycle: { attach: () => editorAttach(), detach: () => editorDetach() },
  intents: {},
  view: () => jsx('div', { class: 'editor', children: 'ready' }),
});

function snapshotScripts(snapshots: any[]): string {
  return snapshots
    .map(
      (s) =>
        `<script type="application/janux+state" data-uri="${s.uri}">${JSON.stringify({ state: s.state, sources: s.sources ?? {} })}</script>`,
    )
    .join('');
}

async function pageHtml(title: string, node: unknown): Promise<string> {
  const { html, snapshots } = await renderToString(node, { storeDefs: { theme } });

  return `<!doctype html><html><head><title>${title}</title></head><body>${html}${snapshotScripts(snapshots)}</body></html>`;
}

describe('SPA navigation (streamed diff)', () => {
  it('applies the three state rules: app stores live, persist islands live, the rest re-resumes', async () => {
    const pageA = await pageHtml('Page A', [
      jsx('h1', { children: 'A' }),
      jsx(counter as any, {}),
      jsx(chat as any, { persist: true }),
    ]);
    const pageB = await pageHtml('Page B', [
      jsx('h1', { children: 'B' }),
      jsx(chat as any, { persist: true }),
    ]);

    document.write(pageA);
    document.close();
    expect(document.querySelector('janux-island[data-jx="chat#default"]')!.hasAttribute('data-jx-persist')).toBe(true);

    const client = boot({ defs: [counter, chat, theme] });

    // live state before navigating
    await client.call('theme.toggle');
    await client.call('chat.add', { text: 'hello' });
    await client.call('counter.inc');
    await client.settled();
    counterDetach.mockClear();

    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      body: new Response(pageB).body,
    }));
    await client.navigate('/b');

    // swapped content + title (whole-document diff)
    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(document.title).toBe('Page B');

    // rule 1: app-scope store survives with live state
    expect(((await client.read('store://theme')) as any).state.mode).toBe('light');

    // rule 2: persisted island keeps its live instance state
    expect(((await client.read('ui://chat')) as any).state.messages).toEqual([{ text: 'hello' }]);
    expect(document.querySelector('janux-island[data-jx="chat#default"] li')!.textContent).toBe('hello');

    // rule 3: the counter was disposed (detach ran) and is gone from the page
    expect(counterDetach).toHaveBeenCalledTimes(1);
    expect(document.querySelector('janux-island[data-jx="counter#default"]')).toBeNull();
  });

  it('re-mounts an eager island when its page is revisited after navigating away', async () => {
    const pageEditor = await pageHtml('Editor', [jsx('h1', { children: 'E' }), jsx(editor as any, { eager: true })]);
    const pageDoc = await pageHtml('Doc', [jsx('h1', { children: 'D' })]);

    document.write(pageEditor);
    document.close();
    editorAttach.mockClear();
    editorDetach.mockClear();
    const client = boot({ defs: [editor] });

    await client.settled();
    expect(editorAttach).toHaveBeenCalledTimes(1); // first visit mounts

    // navigate away → the island is gone AND torn down (detach ran)
    (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(pageDoc).body }));
    await client.navigate('/doc');
    expect(document.querySelector('janux-island[data-jx="editor#default"]')).toBeNull();
    expect(editorDetach).toHaveBeenCalledTimes(1);

    // revisit → the eager island mounts again from a clean slate (the playground
    // relies on this attach/detach symmetry to reset Monaco)
    (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(pageEditor).body }));
    await client.navigate('/editor');
    expect(document.querySelector('janux-island[data-jx="editor#default"]')).not.toBeNull();
    expect(editorAttach).toHaveBeenCalledTimes(2);
  });

  it('emits janux:error and hard-navigates when the fetch fails', async () => {
    (globalThis as any).fetch = mock(async () => ({ ok: false, status: 500 }));
    document.write(await pageHtml('Page A', jsx(chat as any, {})));
    document.close();
    const client = boot({ defs: [chat] });
    const errors: string[] = [];

    document.addEventListener('janux:error', (event: any) => errors.push(event.detail));
    await client.navigate('/broken'); // resolves — the fallback owns the failure
    expect(errors.some((message) => /navigation fetch failed/.test(message))).toBe(true);
  });
});
