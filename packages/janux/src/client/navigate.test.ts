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

async function pageHtml(title: string, node: unknown, head = ''): Promise<string> {
  const { html, snapshots } = await renderToString(node, { storeDefs: { theme } });

  return `<!doctype html><html><head><title>${title}</title>${head}</head><body>${html}${snapshotScripts(snapshots)}</body></html>`;
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
      text: async () => pageB,
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

  /**
   * A feedback layer's overlay (status chips, a glow ring host) is injected into
   * the body at runtime, so the incoming page never lists it and the diff drops
   * it — and the module that injected it does not run again on a later page.
   * `keepRuntimeStyles` already solves this for the <head>; body-level runtime
   * nodes need the same treatment, opted into with `data-janux-keep`.
   */
  it('keeps runtime-injected nodes marked data-janux-keep across a navigation', async () => {
    const pageA = await pageHtml('Page A', jsx('h1', { children: 'A' }));
    const pageB = await pageHtml('Page B', jsx('h1', { children: 'B' }));

    document.write(pageA);
    document.close();
    const client = boot({ defs: [counter] });
    const overlay = document.createElement('div');
    const plain = document.createElement('div');
    // A host the app asked to place inside its own layout, not at body level.
    const panel = document.createElement('section');
    const nested = document.createElement('div');

    overlay.id = 'agent-overlay';
    overlay.setAttribute('data-janux-keep', '');
    plain.id = 'plain-node';
    nested.id = 'nested-overlay';
    nested.setAttribute('data-janux-keep', '');
    panel.id = 'panel';
    panel.appendChild(nested);
    document.body.append(overlay, plain, panel);

    (globalThis as any).fetch = mock(async () => ({ ok: true, text: async () => pageB }));
    await client.navigate('/b');

    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(document.getElementById('agent-overlay')).toBe(overlay);
    // Marking it is a promise the runtime keeps wherever the node lives.
    expect(document.getElementById('nested-overlay')).toBe(nested);
    // Unmarked nodes still belong to the page: the diff owns them.
    expect(document.getElementById('plain-node')).toBeNull();
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
    (globalThis as any).fetch = mock(async () => ({ ok: true, text: async () => pageDoc }));
    await client.navigate('/doc');
    expect(document.querySelector('janux-island[data-jx="editor#default"]')).toBeNull();
    expect(editorDetach).toHaveBeenCalledTimes(1);

    // revisit → the eager island mounts again from a clean slate (the playground
    // relies on this attach/detach symmetry to reset Monaco)
    (globalThis as any).fetch = mock(async () => ({ ok: true, text: async () => pageEditor }));
    await client.navigate('/editor');
    expect(document.querySelector('janux-island[data-jx="editor#default"]')).not.toBeNull();
    expect(editorAttach).toHaveBeenCalledTimes(2);
  });

  it('a leaving island never leaks its imperative runtime DOM into the next page', async () => {
    const widget = component({
      name: 'widget',
      lifecycle: {
        attach: () => {
          const host = document.querySelector('.w-host')!;

          for (let i = 0; i < 30; i++) {
            host.appendChild(Object.assign(document.createElement('div'), { textContent: `IMPERATIVE-${i}` }));
          }
        },
      },
      intents: {},
      view: () => jsx('div', { class: 'w-host', children: 'shell' }),
    });
    const pageW = await pageHtml('W', [jsx('h1', { children: 'W' }), jsx(widget as any, { eager: true })]);
    const pageD = await pageHtml('D', [
      jsx('h1', { children: 'D' }),
      jsx('nav', { children: [jsx('a', { href: '/x', children: 'x' }), jsx('a', { href: '/y', children: 'y' })] }),
    ]);

    document.write(pageW);
    document.close();
    const client = boot({ defs: [widget] });

    await client.settled();
    expect(document.querySelectorAll('.w-host div').length).toBe(30);

    (globalThis as any).fetch = mock(async () => ({ ok: true, text: async () => pageD }));
    await client.navigate('/d');

    expect(document.body.innerHTML).not.toContain('IMPERATIVE');
    expect(document.querySelector('janux-island[data-jx="widget#default"]')).toBeNull();
    expect(document.querySelectorAll('nav a').length).toBe(2);
  });

  it('keeps runtime-injected stylesheets across navigations (lazy editors, vite dev styles)', async () => {
    document.write(await pageHtml('A', jsx('h1', { children: 'A' })));
    document.close();
    const client = boot({ defs: [] });
    const style = document.createElement('style');

    style.textContent = '.monaco-editor { position: relative; }';
    document.head.appendChild(style);

    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      text: async () => await pageHtml('B', jsx('h1', { children: 'B' })),
    }));
    await client.navigate('/b');

    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(style.isConnected).toBe(true);
  });

  /**
   * Social tags and structured data are per-page, and a stale one is worse than
   * a missing one: a shared link would advertise the previous page's card. They
   * carry stable ids so the diff matches them by identity — and, unlike runtime
   * stylesheets, nothing resurrects them, so leaving a page must drop them.
   */
  it('drops the previous page social tags and JSON-LD, and updates the ones that stay', async () => {
    const socialHead =
      '<link rel="canonical" id="jx-canonical" href="https://janux.dev/a">' +
      '<meta property="og:title" id="jx-og-title" content="Page A">' +
      '<meta property="og:image" id="jx-og-image" content="https://janux.dev/a.png">' +
      '<script type="application/ld+json" id="jx-jsonld-0">{"name":"A"}</script>';

    document.write(await pageHtml('A', jsx('h1', { children: 'A' }), socialHead));
    document.close();
    const client = boot({ defs: [] });

    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(1);

    // a page that declares none of them
    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      text: async () => await pageHtml('B', jsx('h1', { children: 'B' })),
    }));
    await client.navigate('/b');

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelectorAll('meta[property^="og:"]').length).toBe(0);
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);

    // and back to a page that declares its own: updated in place, not duplicated
    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      text: async () =>
        await pageHtml(
          'C',
          jsx('h1', { children: 'C' }),
          '<meta property="og:title" id="jx-og-title" content="Page C">',
        ),
    }));
    await client.navigate('/c');

    expect(document.querySelectorAll('meta[property="og:title"]').length).toBe(1);
    expect(document.querySelector('meta[property="og:title"]')!.getAttribute('content')).toBe('Page C');
  });

  it('buffers the response into a single chunk before diffing (deterministic swap)', async () => {
    const pageA = await pageHtml('Page A', jsx('h1', { children: 'A' }));
    const pageB = await pageHtml('Page B', jsx('h1', { children: 'B' }));
    let bodyRead = false;

    document.write(pageA);
    document.close();
    const client = boot({ defs: [] });

    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      text: async () => pageB,
      get body() {
        bodyRead = true;

        return new Response(pageB).body;
      },
    }));
    await client.navigate('/b');

    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(bodyRead).toBe(false);
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
