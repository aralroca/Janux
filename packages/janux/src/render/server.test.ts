import { describe, expect, it } from 'bun:test';
import { component, intent, source, store } from '../define/factories';
import { jsx, Fragment } from '../jsx-runtime';
import { int, list, schema, str } from '../schema';
import { buildManifest } from '../manifest';
import { renderToStream, renderToString } from './server';

function PriceTag({ amount }: { amount: number }) {
  return jsx('span', { class: 'price', children: `${amount}¢` });
}

const cart = component({
  name: 'cart',
  description: 'Shopping cart',
  state: schema({ items: list({ id: str(), qty: int() }) }),
  derived: { count: (s: any) => s.items.length },
  sources: { catalog: source({ query: async () => ['p1', 'p2'] }) },
  emits: { 'cart.cleared': schema({}) },
  intents: {
    addItem: intent({
      description: 'Add product',
      input: schema({ id: str() }),
      run: ({ state, input }) => state.items.push({ id: input.id, qty: 1 }),
    }),
    checkout: intent({ guard: 'confirm', run: () => {} }),
    admin: intent({ guard: 'forbidden', run: () => {} }),
  },
  view: ({ state, sources, intents }: any) =>
    jsx('section', {
      children: [
        jsx('p', { children: `${state.items.length} items / ${sources.catalog.value.length} products` }),
        jsx('button', { onClick: intents.checkout, children: 'Pay' }),
      ],
    }),
});

describe('renderToString', () => {
  it('renders static components with zero islands', async () => {
    const page = jsx('main', { children: jsx(PriceTag as any, { amount: 100 }) });
    const result = await renderToString(page);

    expect(result.html).toBe('<main><span class="price">100¢</span></main>');
    expect(result.registry.islands).toHaveLength(0);
    expect(result.snapshots).toHaveLength(0);
  });

  it('serializes a style object to CSS text', async () => {
    const page = jsx('div', {
      style: { backgroundColor: 'red', width: 10, '--x': '1px', margin: undefined },
      children: 'ok',
    });
    const result = await renderToString(page);

    expect(result.html).toBe('<div style="background-color:red;width:10;--x:1px">ok</div>');
  });

  it('leaves no style attribute behind for an empty style object', async () => {
    const result = await renderToString(jsx('div', { style: {}, children: 'ok' }));

    expect(result.html).toBe('<div>ok</div>');
  });

  it('stringifies aria-* booleans — absent and empty both read as invalid ARIA', async () => {
    const page = jsx('button', { 'aria-selected': true, 'aria-expanded': false, children: 'ok' });
    const result = await renderToString(page);

    expect(result.html).toBe('<button aria-selected="true" aria-expanded="false">ok</button>');
  });

  it('stringifies enumerated booleans — draggable={false} absent would mean draggable', async () => {
    const page = jsx('img', { draggable: false, contentEditable: false, spellcheck: true });
    const result = await renderToString(page);

    expect(result.html).toBe('<img draggable="false" contentEditable="false" spellcheck="true"/>');
  });

  it('stringifies enumerated booleans in any spelling the DOM accepts', async () => {
    const page = jsx('my-editor', { contenteditable: false, spellCheck: false, children: 'ok' });
    const result = await renderToString(page);

    expect(result.html).toBe('<my-editor contenteditable="false" spellCheck="false">ok</my-editor>');
  });

  it('still drops a malformed attribute name when its value is a boolean', async () => {
    const page = jsx('div', { 'aria-x" onmouseover="alert(1)': true, children: 'ok' });
    const result = await renderToString(page);

    expect(result.html).toBe('<div>ok</div>');
  });

  it('escapes text and attribute content', async () => {
    const page = jsx('p', { title: '"><script>', children: '<script>alert(1)</script>' });
    const result = await renderToString(page);

    expect(result.html).toBe(
      '<p title="&quot;&gt;&lt;script&gt;">&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('renders islands with loaded sources, markers and snapshots', async () => {
    const page = jsx(Fragment, { children: [jsx('h1', { children: 'Shop' }), jsx(cart as any, {})] });
    const result = await renderToString(page, { initialState: { 'ui://cart#default': { items: [{ id: 'a', qty: 1 }] } } });

    expect(result.html).toContain('<janux-island key="cart#default" data-jx="cart#default">');
    expect(result.html).toContain('1 items / 2 products');
    expect(result.html).toContain('data-jxa="cart#default:checkout"');
    expect(result.snapshots).toEqual([
      {
        uri: 'ui://cart#default',
        state: { items: [{ id: 'a', qty: 1 }] },
        sources: { catalog: { value: ['p1', 'p2'] } },
      },
    ]);
  });

  it('renders void elements self-closed and skips function props', async () => {
    const result = await renderToString(jsx('input', { value: 'x', onInput: () => {} }));

    expect(result.html).toBe('<input value="x"/>');
  });

  it('marks persist and eager islands with data attributes (SPA navigation)', async () => {
    const persisted = await renderToString(jsx(cart as any, { persist: true }));
    const eager = await renderToString(jsx(cart as any, { eager: true }));
    const plain = await renderToString(jsx(cart as any, {}));

    expect(persisted.html).toContain('data-jx="cart#default" data-jx-persist>');
    expect(eager.html).toContain('data-jx="cart#default" data-jx-eager>');
    expect(plain.html).toContain('data-jx="cart#default">');
  });

  it('sanitizes attacker-controlled island keys (XSS regression)', async () => {
    const evil = 'x"><img src=x onerror=alert(1)>';
    const result = await renderToString(jsx(cart as any, { key: evil }));
    const id = result.html.match(/data-jx="([^"]+)"/)?.[1];

    expect(result.html).not.toContain('"><img');
    expect(result.html).not.toContain('&quot;&gt;&lt;img');
    // Keys are reduced to a marker/selector-safe charset before rendering.
    expect(id).toMatch(/^cart#[\w.~-]+$/);
  });

  it('drops invalid attribute names (attribute injection regression)', async () => {
    const result = await renderToString(jsx('div', { 'onmouseover=alert(1) x': 'y', title: 'ok' }));

    expect(result.html).toBe('<div title="ok"></div>');
  });
});

describe('renderToStream', () => {
  // Several timer ticks: chunk coalescing flushes on its own macrotask.
  const settle = async () => {
    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve));
  };

  /**
   * Regression: the coalescer used to schedule a fresh 0ms timer per RAW chunk
   * (~3 per element). A microtask-only render loop — a static export, a
   * benchmark, a busy server draining back-to-back renders — never reaches the
   * timer phase, so every one of those timers stays pending and pins its
   * promise machinery: ~800KB retained per render, unbounded growth, OOM.
   * The coalescer must keep at most ONE live timer per generator.
   */
  it('schedules O(1) timers per render, not one per chunk', async () => {
    const page = jsx('div', {
      children: Array.from({ length: 200 }, (_, i) => jsx('p', { children: `p${i}` })),
    });
    const realSetTimeout = globalThis.setTimeout;
    let scheduled = 0;

    globalThis.setTimeout = ((fn: any, ms?: number, ...rest: any[]) => {
      scheduled += 1;

      return realSetTimeout(fn, ms, ...rest);
    }) as typeof setTimeout;
    try {
      await renderToString(page);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(scheduled).toBeLessThanOrEqual(5);
  });

  function slowComponent(gate: Promise<string[]>) {
    return component({
      name: 'slow',
      sources: { catalog: source({ query: () => gate }) },
      view: ({ sources }: any) => jsx('p', { children: `slow:${sources.catalog.value.length}` }),
    });
  }

  it('emits earlier siblings while a later island is still loading its sources', async () => {
    let release!: (products: string[]) => void;
    const gate = new Promise<string[]>((resolve) => { release = resolve; });
    const page = jsx('main', {
      children: [jsx('h1', { children: 'Shop' }), jsx(slowComponent(gate) as any, {})],
    });
    const { chunks } = renderToStream(page);
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    expect(collected.join('')).toContain('<h1>Shop</h1>');
    expect(collected.join('')).not.toContain('slow:');

    release(['p1', 'p2']);
    await drained;
    expect(collected.join('')).toContain('slow:2');
  });

  it('joined chunks are byte-identical to renderToString, with the same snapshots', async () => {
    const page = jsx(Fragment, { children: [jsx('h1', { children: 'Shop' }), jsx(cart as any, {})] });
    const options = { initialState: { 'ui://cart#default': { items: [{ id: 'a', qty: 1 }] } } };
    const expected = await renderToString(page, options);
    const { chunks, done } = renderToStream(page, options);
    const collected: string[] = [];

    for await (const chunk of chunks) collected.push(chunk);
    const summary = await done;

    expect(collected.join('')).toBe(expected.html);
    expect(summary.snapshots).toEqual(expected.snapshots);
  });

  /**
   * The client re-renders island views with a synchronous depth-first walk, so
   * SSR must assign nested keys in exactly that order — a scheduling change
   * that keyed the deeper sibling second made two same-typed nested islands
   * swap state on the parent's first re-render.
   */
  it('assigns nested island keys in client traversal order (deep-first, by index)', async () => {
    const badge = component({ name: 'badge', view: () => jsx('b', { children: 'x' }) });
    const parent = component({
      name: 'parent',
      view: () =>
        jsx('div', {
          children: [jsx('section', { children: jsx(badge as any, {}) }), jsx(badge as any, {})],
        }),
    });
    const { html } = await renderToString(jsx(parent as any, {}));
    const keys = [...html.matchAll(/data-jx="(badge#[^"]+)"/g)].map((match) => match[1]);

    expect(keys).toEqual(['badge#parent.default.1', 'badge#parent.default.2']);
    // And .1 is the nested one: it sits inside the <section>.
    expect(html).toContain('<section><janux-island key="badge#parent.default.1"');
  });

  it('an abandoned stream settles `done` and stops descending into new work', async () => {
    let releaseParent!: () => void;
    const gate = new Promise<void>((resolve) => { releaseParent = resolve; });
    let nestedQueries = 0;
    const nested = component({
      name: 'nested',
      sources: { data: source({ query: async () => { nestedQueries += 1; return []; } }) },
      view: () => jsx('i', { children: 'n' }),
    });
    const slowParent = component({
      name: 'slow-parent',
      sources: { data: source({ query: () => gate.then(() => []) }) },
      view: () => jsx(nested as any, {}),
    });
    const { chunks, done, cancel } = renderToStream(jsx('main', { children: jsx(slowParent as any, {}) }));

    await chunks.next(); // the first flush is on the wire
    cancel(); // ...and the client disconnects

    releaseParent();
    await done; // settles anyway — no promise left dangling per aborted request
    expect(nestedQueries).toBe(0); // the parent's children were never started
  });

  it('keeps sibling islands loading in parallel, not serialized by document order', async () => {
    // `a` only resolves once `b` has started: serialized rendering would deadlock here.
    let bStarted!: () => void;
    const gate = new Promise<void>((resolve) => { bStarted = resolve; });
    const first = component({
      name: 'first',
      sources: { data: source({ query: async () => { await gate; return ['a']; } }) },
      view: ({ sources }: any) => jsx('span', { children: sources.data.value[0] }),
    });
    const second = component({
      name: 'second',
      sources: { data: source({ query: async () => { bStarted(); return ['b']; } }) },
      view: ({ sources }: any) => jsx('span', { children: sources.data.value[0] }),
    });
    const page = jsx('div', { children: [jsx(first as any, {}), jsx(second as any, {})] });
    const { chunks } = renderToStream(page);
    const collected: string[] = [];

    for await (const chunk of chunks) collected.push(chunk);

    expect(collected.join('')).toContain('<span>a</span>');
    expect(collected.join('')).toContain('<span>b</span>');
  });
});

describe('error boundaries', () => {
  it('renders the error view in place and keeps the rest of the page alive', async () => {
    const card = component({
      name: 'card',
      error: ({ error }) => jsx('p', { children: `failed:${(error as Error).message}` }),
      view: () => {
        throw new Error('nope');
      },
    });
    const page = jsx('main', { children: [jsx(card as any, {}), jsx('h1', { children: 'alive' })] });
    const { html } = await renderToString(page);

    expect(html).toContain(
      '<janux-island key="card#default" data-jx="card#default"><p>failed:nope</p></janux-island>',
    );
    expect(html).toContain('<h1>alive</h1>');
  });

  it('bubbles a nested island error to the closest ancestor error view', async () => {
    const broken = component({
      name: 'broken',
      view: () => {
        throw new Error('inner');
      },
    });
    const shell = component({
      name: 'shell',
      error: ({ error }) => jsx('p', { children: `caught:${(error as Error).message}` }),
      view: () => jsx('section', { children: jsx(broken as any, {}) }),
    });
    const { html, registry } = await renderToString(jsx(shell as any, {}));

    expect(html).toContain('caught:inner');
    // The partial subtree is discarded, DOM and registry both.
    expect(html).not.toContain('<section>');
    expect(registry.islands.map((record) => record.def.name)).toEqual(['shell']);
  });

  /**
   * The discarded attempt consumed nested keys the client's depth-first walk
   * will never see: the error view must start a fresh sequence, or its islands
   * ship state under identities no client can recompute.
   */
  it('the error view starts a fresh nested key sequence', async () => {
    const kid = component({ name: 'kid', view: () => jsx('b', { children: 'k' }) });
    // Throws while RENDERING, after the kid island already consumed a key.
    function Bomb(): never {
      throw new Error('after the kid');
    }
    const shell = component({
      name: 'shell-keys',
      error: () => jsx('div', { children: jsx(kid as any, {}) }),
      view: () => [jsx(kid as any, {}), jsx(Bomb as any, {})],
    });
    const { html } = await renderToString(jsx(shell as any, {}));

    expect(html).toContain('data-jx="kid#shell-keys.default.1"');
    expect(html).not.toContain('data-jx="kid#shell-keys.default.2"');
  });

  it('fails soft without any error view: the page completes and janux:error is dispatched', async () => {
    const broken = component({
      name: 'broken',
      view: () => {
        throw new Error('inner');
      },
    });
    const page = jsx('main', { children: [jsx(broken as any, {}), jsx('h1', { children: 'alive' })] });
    const { html } = await renderToString(page);

    expect(html).toContain('janux:error');
    expect(html).toContain('</janux-island>');
    expect(html).toContain('<h1>alive</h1>');
  });

  it('a failing render still settles done', async () => {
    const Bomb = () => {
      throw new Error('boom');
    };
    const { chunks, done } = renderToStream(jsx('main', { children: jsx(Bomb as any, {}) }));
    const drained = (async () => {
      for await (const chunk of chunks) chunk;
    })();

    await expect(drained).rejects.toThrow('boom');
    await done;
  });
});

describe('suspense boundaries', () => {
  const settle = async () => {
    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve));
  };

  function gated(name: string) {
    let release!: (products: string[]) => void;
    const gate = new Promise<string[]>((resolve) => {
      release = resolve;
    });
    const def = component({
      name,
      sources: { data: source({ query: () => gate }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: ({ sources }) => jsx('p', { children: `got:${sources.data.value.length}` }),
    });

    return { def, release: (products: string[]) => release(products) };
  }

  it('streams the fallback and swaps the real content in a trailing template', async () => {
    const { def, release } = gated('slow');
    const page = jsx('main', { children: [jsx(def as any, {}), jsx('h1', { children: 'after' })] });
    const { chunks, done } = renderToStream(page);
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    const early = collected.join('');

    expect(early).toContain('data-jx="slow#default" data-jx-pending><p>wait</p></janux-island>');
    expect(early).toContain('<h1>after</h1>');
    expect(early).not.toContain('got:');

    release(['a', 'b']);
    await drained;
    const full = collected.join('');
    const summary = await done;

    expect(full).toContain('<template id="jxu:slow#default" key="jxt:slow#default"><p>got:2</p></template>');
    expect(full).toContain('jx$u("slow#default",document.currentScript)');
    expect(full).toContain('self.jx$u=');
    expect(summary.snapshots[0]?.sources).toEqual({ data: { value: ['a', 'b'] } });
  });

  const drainStream = async (page: unknown) => {
    const { chunks } = renderToStream(page);
    const collected: string[] = [];

    for await (const chunk of chunks) collected.push(chunk);

    return collected.join('');
  };

  it('inlines the content when sources settle before the fallback would flush', async () => {
    const fast = component({
      name: 'fast',
      sources: { data: source({ query: async () => ['a'] }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: ({ sources }) => jsx('p', { children: `got:${sources.data.value.length}` }),
    });
    const html = await drainStream(jsx(fast as any, {}));

    expect(html).toContain('data-jx="fast#default"><p>got:1</p></janux-island>');
    expect(html).not.toContain('data-jx-pending');
    expect(html).not.toContain('<template');
  });

  it('renderToString resolves a slow suspense island in place (agent-facing renders)', async () => {
    const slow = component({
      name: 'slow-inline',
      sources: { data: source({ query: () => new Promise((resolve) => setTimeout(() => resolve(['a']), 5)) }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: ({ sources }) => jsx('p', { children: `got:${sources.data.value.length}` }),
    });
    const { html } = await renderToString(jsx(slow as any, {}));

    expect(html).toContain('<p>got:1</p>');
    expect(html).not.toContain('data-jx-pending');
    expect(html).not.toContain('<template');
  });

  it('a discarded guarded subtree flushes no boundaries', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const nested = component({
      name: 'nested-suspended',
      sources: { data: source({ query: () => gate.then(() => []) }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: () => jsx('p', { children: 'never shown' }),
    });
    // A static sibling that throws while rendering — AFTER the suspended
    // island already registered its boundary and emitted its fallback.
    function Bomb(): never {
      throw new Error('shell failed');
    }
    const shell = component({
      name: 'discarding-shell',
      error: () => jsx('p', { children: 'error view' }),
      view: () => jsx('div', { children: [jsx(nested as any, {}), jsx(Bomb as any, {})] }),
    });
    const drained = drainStream(jsx(shell as any, {}));

    release();
    const html = await drained;

    expect(html).toContain('error view');
    expect(html).not.toContain('<template');
    expect(html).not.toContain('jx$u');
  });

  it('flushes boundaries in resolution order and ships the runtime once', async () => {
    const first = gated('first');
    const second = gated('second');
    const page = jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] });
    const { chunks } = renderToStream(page);
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    second.release(['b']);
    await settle();
    first.release(['a', 'b']);
    await drained;
    const full = collected.join('');

    expect(full.indexOf('id="jxu:second#default"')).toBeLessThan(full.indexOf('id="jxu:first#default"'));
    expect(full.split('self.jx$u=')).toHaveLength(2);
  });

  it('renders the error view into the template when suspended content throws', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const def = component({
      name: 'sboom',
      sources: { data: source({ query: () => gate.then(() => []) }) },
      suspense: () => jsx('p', { children: 'wait' }),
      error: ({ error }) => jsx('p', { children: `bad:${(error as Error).message}` }),
      view: () => {
        throw new Error('late');
      },
    });
    const { chunks } = renderToStream(jsx(def as any, {}));
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    release();
    await drained;
    const full = collected.join('');

    expect(full).toContain('data-jx="sboom#default" data-jx-pending><p>wait</p>');
    expect(full).toContain('<template id="jxu:sboom#default" key="jxt:sboom#default"><p>bad:late</p></template>');
  });

  it('a suspended island failing without an error view swaps to empty and reports janux:error', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const def = component({
      name: 'sfail',
      sources: { data: source({ query: () => gate.then(() => []) }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: () => {
        throw new Error('late');
      },
    });
    const { chunks } = renderToStream(jsx(def as any, {}));
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    release();
    await drained;
    const full = collected.join('');

    expect(full).toContain('<template id="jxu:sfail#default" key="jxt:sfail#default"></template>');
    expect(full).toContain('janux:error');
  });

  it('emits the onBeforeBoundaries interlude between the body and the first boundary chunk', async () => {
    const { def, release } = gated('mid');
    const page = jsx('main', { children: jsx(def as any, {}) });
    const { chunks } = renderToStream(page, { onBeforeBoundaries: () => '<!--interlude-->' });
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    release(['a']);
    await drained;
    const full = collected.join('');

    expect(full.indexOf('</main>')).toBeLessThan(full.indexOf('<!--interlude-->'));
    expect(full.indexOf('<!--interlude-->')).toBeLessThan(full.indexOf('<template'));
  });

  it('skips the interlude when every boundary resolved inline', async () => {
    const fast = component({
      name: 'fast-mid',
      sources: { data: source({ query: async () => ['a'] }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: ({ sources }) => jsx('p', { children: `got:${sources.data.value.length}` }),
    });
    const { chunks } = renderToStream(jsx(fast as any, {}), { onBeforeBoundaries: () => '<!--interlude-->' });
    const collected: string[] = [];

    for await (const chunk of chunks) collected.push(chunk);

    expect(collected.join('')).not.toContain('<!--interlude-->');
  });

  it('a throwing suspense view still closes the island and swaps the content in', async () => {
    let release!: (rows: string[]) => void;
    const gate = new Promise<string[]>((resolve) => {
      release = resolve;
    });
    const def = component({
      name: 'bad-fallback',
      sources: { data: source({ query: () => gate }) },
      suspense: () => {
        throw new Error('fallback boom');
      },
      view: ({ sources }) => jsx('p', { children: `got:${sources.data.value.length}` }),
    });
    const page = jsx('main', { children: [jsx(def as any, {}), jsx('h1', { children: 'after' })] });
    const { chunks } = renderToStream(page);
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    await settle();
    release(['a']);
    await drained;
    const full = collected.join('');

    // The island closed (siblings are outside it), the failure was reported
    // in place, and the boundary still delivered its content.
    expect(full).toContain('</script></janux-island><h1>after</h1>');
    expect(full).toContain('janux:error');
    expect(full).toContain('<template id="jxu:bad-fallback#default"');
    expect(full).toContain('got:1');
  });

  it('an abandoned stream stops waiting on pending boundaries and settles done', async () => {
    const { def } = gated('stuck');
    const { chunks, done, cancel } = renderToStream(jsx('main', { children: jsx(def as any, {}) }));

    await chunks.next();
    cancel();

    await done;
  });
});

describe('buildManifest', () => {
  const session = store({
    name: 'session',
    state: schema({ locale: str().default('en') }),
    intents: { setLocale: intent({ input: schema({ locale: str() }), run: () => {} }) },
  });
  const header = component({ name: 'header', use: { session }, view: () => null });

  it('projects mounted components as resources, tools and events', () => {
    const manifest = buildManifest([{ def: cart, key: 'default' }, { def: session }, { def: header }]);

    expect(manifest.resources.map((r) => r.uri)).toEqual(['ui://cart', 'store://session']);
    expect(manifest.tools.map((t) => `${t.name}:${t.guard}`)).toEqual([
      'cart.addItem:auto',
      'cart.checkout:confirm',
      'session.setLocale:auto',
    ]);
    expect(manifest.events).toEqual(['cart.cleared']);
  });

  it('hides forbidden tools and lists store readers', () => {
    const manifest = buildManifest([{ def: cart }, { def: session }, { def: header }]);
    const sessionResource = manifest.resources.find((r) => r.uri === 'store://session');

    expect(manifest.tools.find((t) => t.name === 'cart.admin')).toBeUndefined();
    expect(sessionResource!.readers).toEqual(['ui://header']);
  });

  it('serializes tool input schemas as JSON Schema', () => {
    const manifest = buildManifest([{ def: cart }]);
    const addItem = manifest.tools.find((t) => t.name === 'cart.addItem')!;

    expect(addItem.input).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    });
  });
});
