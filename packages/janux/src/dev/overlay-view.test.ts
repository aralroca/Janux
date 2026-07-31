import { describe, expect, it } from 'bun:test';
import { chainRows, overlayMarkup, type DevErrorReport } from './overlay-view';

/**
 * The point of the overlay. Every framework can print the stack of a `throw`;
 * these assertions are about the rows above it — the route and its `_layout`
 * chain, the island, the named behavior, the guard that was evaluated and the
 * origin the invocation arrived with. That sentence is what Janux knows and a
 * bundler-level overlay cannot reconstruct.
 */

const ROUTE = {
  path: '/orders/abc123',
  pattern: '/orders/[id]',
  file: 'src/routes/orders/[id].tsx',
  layouts: ['src/routes/_layout.tsx', 'src/routes/(shop)/_layout.tsx'],
  params: { id: 'abc123' },
};

const REPORT: DevErrorReport = {
  error: new Error('payment gateway is down'),
  chain: {
    kind: 'intent',
    component: 'cart',
    name: 'checkout',
    island: 'ui://cart#default',
    origin: 'agent',
    guard: 'confirm',
    input: { coupon: 'SUMMER' },
  },
  route: ROUTE,
};

const rowsOf = (report: DevErrorReport) => Object.fromEntries(chainRows(report));

describe('the Janux chain the overlay renders', () => {
  it('walks route → layouts → island → intent → guard → origin', () => {
    expect(chainRows(REPORT).map(([label]) => label)).toEqual([
      'route',
      'layouts',
      'island',
      'intent',
      'guard',
      'origin',
      'input',
    ]);
  });

  it('shows the URL, the pattern it matched and the file that answered', () => {
    expect(rowsOf(REPORT).route).toBe('/orders/abc123  →  /orders/[id]  ·  src/routes/orders/[id].tsx');
  });

  it('shows the layout chain outermost first', () => {
    expect(rowsOf(REPORT).layouts).toBe('src/routes/_layout.tsx  →  src/routes/(shop)/_layout.tsx');
  });

  it('names the behavior as the agent surface names it', () => {
    expect(rowsOf(REPORT).intent).toBe('cart.checkout');
    expect(rowsOf(REPORT).island).toBe('ui://cart#default');
  });

  /** The differentiating pair: why this invocation was allowed to reach the code that threw. */
  it('reports the resolved guard and the origin it was resolved for', () => {
    expect(rowsOf(REPORT).guard).toBe('confirm');
    expect(rowsOf(REPORT).origin).toBe('agent');
  });

  it('labels the row by the kind of behavior that failed', () => {
    const effect = { ...REPORT, chain: { kind: 'effect' as const, component: 'cart', name: 'syncTotals' } };

    expect(chainRows(effect).map(([label]) => label)).toEqual(['route', 'layouts', 'effect']);
    expect(rowsOf(effect).effect).toBe('cart.syncTotals');
  });

  /** Nothing to say is said as nothing: an em dash beats an empty row you cannot read. */
  it('marks an absent layout chain rather than dropping the row', () => {
    const bare = { ...REPORT, route: { ...ROUTE, layouts: [] } };

    expect(rowsOf(bare).layouts).toBe('—');
  });

  /**
   * An error that never went through an intent, effect or source has no Janux
   * chain, and saying so is the honest answer — inventing one would be worse
   * than a plain stack.
   */
  it('still places an unexplained error on its route', () => {
    const rows = rowsOf({ error: new Error('undefined is not a function'), route: ROUTE });

    expect(rows.route).toBe('/orders/abc123  →  /orders/[id]  ·  src/routes/orders/[id].tsx');
    expect(rows.island).toBeUndefined();
    expect(rows.guard).toBeUndefined();
  });

  it('works with no route resolved at all', () => {
    expect(rowsOf({ error: new Error('boom') }).route).toBe('—');
  });
});

describe('the overlay markup', () => {
  it('leads with the error message and keeps the stack', () => {
    const html = overlayMarkup(REPORT, 1);

    expect(html).toContain('payment gateway is down');
    expect(html).toContain('overlay-view.test');
  });

  it('escapes everything it did not write itself', () => {
    const html = overlayMarkup({ error: new Error('<img src=x onerror=alert(1)>') }, 1);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  /** One overlay, not a stack of them: later failures raise a count on the same panel. */
  it('counts repeat failures instead of stacking panels', () => {
    expect(overlayMarkup(REPORT, 1)).not.toContain('data-jx-count');
    expect(overlayMarkup(REPORT, 4)).toContain('+3 more');
  });
});
