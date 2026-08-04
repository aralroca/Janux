import { describe, expect, it } from 'bun:test';
import type { DevtoolsModel } from './devtools-view';
import { devtoolsMarkup } from './devtools-view';

const EMPTY = { islands: [], stores: [] };

const model = (over: Partial<DevtoolsModel> = {}): DevtoolsModel => ({
  open: true,
  tab: 'islands',
  tree: EMPTY,
  timeline: [],
  webmcp: { native: false, tools: [] },
  proposals: [],
  ...over,
});

const node = (id: string, children: DevtoolsModel['tree']['islands'] = []) => {
  const [name = id, key = 'default'] = id.split('#');

  return { id, name, key, uri: `ui://${id}`, sync: 'idle', children };
};

describe('devtools panel markup', () => {
  it('renders only the launcher while closed', () => {
    const html = devtoolsMarkup(model({ open: false }));

    expect(html).toContain('data-jxdt-toggle');
    expect(html).not.toContain('role="tablist"');
  });

  it('renders a labelled tablist with the active tab selected', () => {
    const html = devtoolsMarkup(model({ tab: 'timeline' }));

    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-jxdt-tab="timeline" role="tab" aria-selected="true"');
    expect(html).toContain('data-jxdt-tab="islands" role="tab" aria-selected="false"');
    expect(html).toContain('aria-label="Janux DevTools"');
  });

  it('nests the ownership tree and marks each island with its settled state', () => {
    const tree = { islands: [node('Cart#default', [node('Row#Cart.default.1')])], stores: [node('session#')] };
    const html = devtoolsMarkup(model({ tree }));

    expect(html).toContain('data-jxdt-node="Cart#default"');
    expect(html).toContain('data-jxdt-node="Row#Cart.default.1"');
    expect(html).toContain('data-jxdt-node="session#"');
    expect(html).toContain('idle');
  });

  it('shows the selected instance state verbatim, escaped, with its source rows', () => {
    const selected = {
      uri: 'ui://Cart#default',
      state: '{"note":"<script>alert(1)</script>"}',
      schema: '{"type":"object"}',
      sync: 'pending',
      sources: [{ name: 'catalog', pending: true, refreshing: false, error: 'HTTP <500>' }],
    };
    const html = devtoolsMarkup(model({ selected }));

    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)');
    expect(html).toContain('catalog');
    expect(html).toContain('HTTP &lt;500&gt;');
  });

  it('renders timeline rows with tool, guard, origin and outcome', () => {
    const timeline = [
      { tool: 'cart.add', origin: 'human' as const, guard: 'auto' as const, input: { id: 'p1' }, ok: true, at: 0 },
      { tool: 'cart.checkout', origin: 'agent' as const, guard: 'confirm' as const, input: {}, ok: true, proposed: true, at: 0 },
      { tool: 'cart.pay', origin: 'agent' as const, guard: 'auto' as const, input: {}, ok: false, error: 'declined', at: 0 },
    ];
    const html = devtoolsMarkup(model({ tab: 'timeline', timeline }));

    expect(html).toContain('cart.add');
    expect(html).toContain('human');
    expect(html).toContain('auto');
    expect(html).toContain('proposed');
    expect(html).toContain('declined');
  });

  it('renders each pending proposal with its keyed visual diff', () => {
    const proposals = [
      {
        id: 'p-1',
        tool: 'cart.checkout',
        input: '{"pay":true}',
        rows: [
          { key: 'items', before: '["p1"]', after: '[]', changed: true },
          { key: 'total', before: '59.99', after: '59.99', changed: false },
        ],
      },
    ];
    const html = devtoolsMarkup(model({ tab: 'proposals', proposals }));

    expect(html).toContain('cart.checkout');
    expect(html).toContain('data-jxdt-diff-changed');
    expect(html).toContain('[&quot;p1&quot;]');
    expect(html).toContain('59.99');
  });

  it('lists the WebMCP tools and says whether the registry is native or polyfilled', () => {
    const webmcp = { native: true, tools: [{ name: 'cart_add', description: 'Add an item' }] };
    const html = devtoolsMarkup(model({ tab: 'webmcp', webmcp }));

    expect(html).toContain('cart_add');
    expect(html).toContain('Add an item');
    expect(html).toContain('native');
  });

  it('shows the manifest as the agent sees it, or an honest empty state', () => {
    expect(devtoolsMarkup(model({ tab: 'manifest' }))).toContain('data-jxdt-refresh');
    const html = devtoolsMarkup(model({ tab: 'manifest', manifest: '{"tools":[{"name":"cart.add"}]}' }));

    expect(html).toContain('cart.add');
  });
});
