import { describe, expect, it } from 'bun:test';
import { component, intent, source, store } from '../define/factories';
import { jsx, Fragment } from '../jsx-runtime';
import { int, list, schema, str } from '../schema';
import { buildManifest } from '../manifest';
import { renderToString } from './server';

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
        jsx('button', { on: intents.checkout, children: 'Pay' }),
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

    expect(result.html).toContain('<janux-island data-jx="cart#default">');
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

  it('escapes attacker-controlled island keys (XSS regression)', async () => {
    const evil = 'x"><img src=x onerror=alert(1)>';
    const result = await renderToString(jsx(cart as any, { key: evil }));

    expect(result.html).not.toContain('"><img');
    expect(result.html).toContain('data-jx="cart#x&quot;&gt;&lt;img');
  });

  it('drops invalid attribute names (attribute injection regression)', async () => {
    const result = await renderToString(jsx('div', { 'onmouseover=alert(1) x': 'y', title: 'ok' }));

    expect(result.html).toBe('<div title="ok"></div>');
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
