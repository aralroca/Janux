import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { component, intent, store } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { bool, int, list, schema, str, enums } from '../schema';
import { renderToString } from '../render/server';
import { boot } from './boot';
import { abortableStream, closeStrandedModals } from './navigate';

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
    jsx('div', { children: [jsx('output', { children: String(state.n) }), jsx('button', { onClick: intents.inc, children: '+' })] }),
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

  it('installs the listener for an event type the new page introduces', async () => {
    const gallery = component({
      name: 'gallery',
      state: schema({ opened: bool() }),
      intents: { open: intent({ run: ({ state }: any) => (state.opened = true) }) },
      view: ({ intents }: any) => jsx('figure', { class: 'shot', onDoubleClick: intents.open }),
    });
    const pageA = await pageHtml('Page A', jsx(counter as any, {}));
    const pageB = await pageHtml('Page B', jsx(gallery as any, {}));

    document.write(pageA);
    document.close();
    const client = boot({ defs: [counter, gallery] });

    (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(pageB).body }));
    await client.navigate('/b');
    document.querySelector('.shot')!.dispatchEvent(new Event('dblclick', { bubbles: true }));
    await client.settled();
    expect(((await client.read('ui://gallery#default')) as any).state.opened).toBe(true);
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

    (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(pageB).body }));
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

    (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(pageD).body }));
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
      body: new Response(await pageHtml('B', jsx('h1', { children: 'B' }))).body,
    }));
    await client.navigate('/b');

    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(style.isConnected).toBe(true);
  });

  /**
   * With `inlineStyles` the app sheet is a `<style>` in every page's HTML, not a
   * runtime-injected one. `keepRuntimeStyles` snapshots every style in the head
   * and re-attaches whatever the diff removed, so the inlined sheet must not
   * come back as a second copy after the incoming page brings its own.
   */
  it('keeps exactly one inlined stylesheet across a navigation', async () => {
    const sheet = '<style id="jx-style-0">body{color:red}</style>';

    document.write(await pageHtml('A', jsx('h1', { children: 'A' }), sheet));
    document.close();
    const client = boot({ defs: [] });

    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      body: new Response(await pageHtml('B', jsx('h1', { children: 'B' }), sheet)).body,
    }));
    await client.navigate('/b');

    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(document.querySelectorAll('style#jx-style-0').length).toBe(1);
    expect(document.querySelectorAll('head style').length).toBe(1);
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
      body: new Response(await pageHtml('B', jsx('h1', { children: 'B' }))).body,
    }));
    await client.navigate('/b');

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelectorAll('meta[property^="og:"]').length).toBe(0);
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);

    // and back to a page that declares its own: updated in place, not duplicated
    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      body: new Response(
        await pageHtml(
          'C',
          jsx('h1', { children: 'C' }),
          '<meta property="og:title" id="jx-og-title" content="Page C">',
        ),
      ).body,
    }));
    await client.navigate('/c');

    expect(document.querySelectorAll('meta[property="og:title"]').length).toBe(1);
    expect(document.querySelector('meta[property="og:title"]')!.getAttribute('content')).toBe('Page C');
  });

  /**
   * The whole point of the streaming diff: the page is applied as it arrives, so
   * a slow connection paints progressively instead of showing the old page until
   * the last byte. This navigation used to buffer the response into a single
   * chunk — a whole page's latency spent looking at the previous one — so what
   * is asserted here is that the body is what gets diffed and `text()` is never
   * called. How a browser parses chunk boundaries is verified against real Chrome
   * (apps/docs), since happy-dom does not model an incremental tokenizer.
   */
  it('diffs the response body, and never buffers it into text', async () => {
    const pageA = await pageHtml('Page A', jsx('h1', { children: 'A' }));
    const pageB = await pageHtml('Page B', jsx('h1', { children: 'B' }));
    let bufferedWholePage = false;
    let streamed = false;

    document.write(pageA);
    document.close();
    const client = boot({ defs: [] });

    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      text: async () => {
        bufferedWholePage = true;

        return pageB;
      },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          streamed = true;
          controller.enqueue(new TextEncoder().encode(pageB));
          controller.close();
        },
      }),
    }));
    await client.navigate('/b');

    expect(document.querySelector('h1')!.textContent).toBe('B');
    expect(document.title).toBe('Page B');
    expect(streamed).toBe(true);
    expect(bufferedWholePage).toBe(false);
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

  /**
   * The page is already on screen by the time islands mount, so a mount that
   * throws must not send the browser to fetch the same URL again: on a
   * deterministic failure (a broken editor island, say) the reload mounts it,
   * it throws, and the site refreshes forever — which is what janux.build's
   * /playground did.
   */
  it('keeps the page when an island fails to mount, instead of reloading into the same failure', async () => {
    const exploding = component({
      name: 'exploding',
      lifecycle: {
        attach: () => {
          throw new Error('mount exploded');
        },
      },
      intents: {},
      view: () => jsx('p', { children: 'boom' }),
    });
    const next = await pageHtml('Page B', jsx(exploding as any, { eager: true }));

    document.write(await pageHtml('Page A', jsx('h1', { children: 'A' })));
    document.close();
    const client = boot({ defs: [exploding] });
    const errors: string[] = [];
    let hardNavigations = 0;

    document.addEventListener('janux:error', (event: any) => errors.push(event.detail));
    (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(next).body }));
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...location, get href() { return 'http://localhost/a'; }, set href(_value: string) { hardNavigations += 1; } },
    });
    await client.navigate('/b');

    expect(hardNavigations).toBe(0);
    expect(document.title).toBe('Page B');
    expect(errors.some((message) => /mount exploded/.test(message))).toBe(true);
  });
});


/**
 * The incoming page carries the server's document-wide rules (it cannot know
 * this browser intercepts), and the diff faithfully applies them — so without
 * re-narrowing them after every navigation, the second page onwards speculates
 * documents the SPA path never uses and hover fetches each page twice.
 */
describe('speculation rules across a navigation', () => {
  it('re-narrows the incoming page rules to native links', async () => {
    const serverRules =
      '<script type="speculationrules" id="jx-speculation">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}</script>';

    document.write(await pageHtml('A', jsx('h1', { children: 'A' }), serverRules));
    document.close();
    (window as any).navigation = { addEventListener() {} };
    const client = boot({ defs: [] });

    (globalThis as any).fetch = mock(async () => ({
      ok: true,
      body: new Response(await pageHtml('B', jsx('h1', { children: 'B' }), serverRules)).body,
    }));
    await client.navigate('/b');

    const rules = JSON.parse(document.getElementById('jx-speculation')!.textContent!);

    expect(document.querySelectorAll('#jx-speculation').length).toBe(1);
    expect(rules.prefetch[0].where).toEqual({ selector_matches: 'a[data-native]' });
    delete (window as any).navigation;
  });
});

/**
 * The `persist` contract: the island keeps its live instance across pages that
 * render it. A destination page that does NOT render it disposes the instance —
 * correct, but from the app's side it reads as "the assistant closed itself",
 * so dev builds must name the island and the route out loud.
 */
describe('persisted island dropped by the incoming page', () => {
  async function navigateAwayFromPersistedChat(): Promise<string[]> {
    const pageA = await pageHtml('A', jsx(chat as any, { persist: true }));
    const pageB = await pageHtml('B', jsx('h1', { children: 'B' }));

    document.write(pageA);
    document.close();
    const client = boot({ defs: [chat] });

    await client.call('chat.add', { text: 'hi' }); // mounts the island
    await client.settled();

    const warned: string[] = [];
    const originalWarn = console.warn;

    console.warn = (...args: unknown[]) => warned.push(args.join(' '));
    try {
      (globalThis as any).fetch = mock(async () => ({ ok: true, body: new Response(pageB).body }));
      await client.navigate('/b');
    } finally {
      console.warn = originalWarn;
    }

    return warned;
  }

  it('warns naming the island, and still disposes it', async () => {
    const warned = await navigateAwayFromPersistedChat();

    expect(warned.some((message) => message.includes('Janux:') && message.includes('chat#default'))).toBe(true);
    expect(document.querySelector('janux-island[data-jx="chat#default"]')).toBeNull();
  });
});

/**
 * Rapid navigations: the Navigation API aborts the superseded one's signal, and
 * its fetch dies with it — but a body served from the prefetch cache has no
 * fetch signal, so the navigation's own signal must kill the stream, or the
 * superseded diff keeps consuming while the newest navigation waits behind it.
 */
describe('superseded navigation stream', () => {
  it('abortableStream errors the reader and cancels the source on abort', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull() {},
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const guarded = abortableStream(source, controller.signal);
    const reader = guarded.getReader();
    const pending = reader.read();

    controller.abort();

    await expect(pending).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve));
    expect(cancelled).toBe(true);
  });

  it('is the identity without a signal', () => {
    const source = new ReadableStream<Uint8Array>();

    expect(abortableStream(source)).toBe(source);
  });
});

describe('modal dialogs across a navigation', () => {
  /**
   * `:modal` is the browser's own top-layer bookkeeping, and no DOM
   * implementation outside a real engine tracks it — the state under test is a
   * dialog the engine still considers modal, so the test says so directly.
   */
  function openModal(inTopLayer = true): { dialog: HTMLDialogElement; closes: () => number } {
    const dialog = document.createElement('dialog') as HTMLDialogElement;
    let closed = 0;

    dialog.setAttribute('open', '');
    dialog.addEventListener('close', () => (closed += 1));
    if (inTopLayer) dialog.matches = (selector: string) => selector === ':modal';
    document.body.replaceChildren(dialog);

    return { dialog, closes: () => closed };
  }

  it('closes a modal the diff stripped `open` from, so the page is not left inert', () => {
    const { dialog, closes } = openModal();

    // What the whole-document diff does when the incoming page has it closed.
    dialog.removeAttribute('open');
    closeStrandedModals();

    expect(closes()).toBe(1);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('leaves a modal the incoming page still has open alone', () => {
    const { dialog, closes } = openModal();

    closeStrandedModals();

    expect(closes()).toBe(0);
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('leaves a dialog that was never modal alone', () => {
    const { dialog, closes } = openModal(false);

    dialog.removeAttribute('open');
    closeStrandedModals();

    expect(closes()).toBe(0);
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
