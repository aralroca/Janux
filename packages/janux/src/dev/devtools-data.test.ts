import { describe, expect, it } from 'bun:test';
import type { JanuxInstance } from '../runtime/instance';
import { createClientRegistry } from '../client/registry';
import { diffRows, ownershipTree, sourceRows, statusOf } from './devtools-data';

const instance = (uri: string, sync = 'idle', sources: Record<string, unknown> = {}) =>
  ({ uri, sources, resource: () => ({ sync }) }) as unknown as JanuxInstance;

/** A registry as mount.ts leaves it: `mounted` keyed by `name#key`, SSR-namespaced nested keys. */
function registryWith(mounted: Record<string, JanuxInstance>, stores: Record<string, JanuxInstance> = {}) {
  const registry = createClientRegistry();

  Object.entries(mounted).forEach(([id, item]) => registry.mounted.set(id, item));
  Object.entries(stores).forEach(([name, item]) => registry.stores.set(name, item));

  return registry;
}

describe('devtools ownership tree', () => {
  it('nests islands by the SSR key namespace, exactly as dispose cascades', () => {
    const registry = registryWith({
      'Cart#default': instance('ui://Cart#default'),
      'Row#Cart.default.1': instance('ui://Row#Cart.default.1'),
      'Badge#Row.Cart.default.1.1': instance('ui://Badge#Row.Cart.default.1.1'),
      'Toasts#default': instance('ui://Toasts#default', 'pending'),
    });

    const { islands } = ownershipTree(registry);
    const cart = islands.find((node) => node.name === 'Cart')!;
    const toasts = islands.find((node) => node.name === 'Toasts')!;

    expect(islands.map((node) => node.id)).toEqual(['Cart#default', 'Toasts#default']);
    expect(cart.children.map((node) => node.id)).toEqual(['Row#Cart.default.1']);
    expect(cart.children[0]!.children.map((node) => node.id)).toEqual(['Badge#Row.Cart.default.1.1']);
    expect(toasts.sync).toBe('pending');
  });

  /** Islands are lazy: before first interaction the registry is empty but the DOM already names them. */
  it('includes DOM islands that have not resumed yet, marked as such', () => {
    const registry = registryWith({ 'cart#default': instance('ui://cart#default') });

    const { islands } = ownershipTree(registry, ['cart#default', 'toasts#default']);
    const toasts = islands.find((node) => node.name === 'toasts')!;

    expect(islands.map((node) => node.id).sort()).toEqual(['cart#default', 'toasts#default']);
    expect(toasts.sync).toBe('not resumed');
    expect(islands.find((node) => node.name === 'cart')!.sync).toBe('idle');
  });

  it('lists stores flat, next to the island roots', () => {
    const registry = registryWith({}, { session: instance('store://session') });

    const { stores } = ownershipTree(registry);

    expect(stores).toEqual([{ id: 'session', name: 'session', key: '', uri: 'store://session', sync: 'idle', children: [] }]);
  });
});

describe('devtools timeline status', () => {
  it('labels an entry proposed, ok or error — in that precedence', () => {
    expect(statusOf({ ok: true, proposed: true })).toBe('proposed');
    expect(statusOf({ ok: true })).toBe('ok');
    expect(statusOf({ ok: false })).toBe('error');
  });
});

describe('devtools proposal diff', () => {
  it('joins before/after by key and marks what changed, additions and removals included', () => {
    const rows = diffRows({ before: { items: [], total: 0, note: 'hi' }, after: { items: ['p1'], total: 59.99 } });

    expect(rows).toEqual([
      { key: 'items', before: '[]', after: '["p1"]', changed: true },
      { key: 'note', before: '"hi"', after: undefined, changed: true },
      { key: 'total', before: '0', after: '59.99', changed: true },
    ]);
  });

  it('keeps untouched keys visible but unmarked', () => {
    expect(diffRows({ before: { total: 0 }, after: { total: 0 } })).toEqual([
      { key: 'total', before: '0', after: '0', changed: false },
    ]);
  });
});

describe('devtools source rows', () => {
  it('reads each reader status without touching its value resolution', () => {
    const shop = instance('ui://Shop#default', 'pending', {
      catalog: { pending: false, refreshing: true, error: null },
      stock: { pending: true, refreshing: false, error: 'HTTP 500' },
    });

    expect(sourceRows(shop)).toEqual([
      { name: 'catalog', pending: false, refreshing: true, error: '' },
      { name: 'stock', pending: true, refreshing: false, error: 'HTTP 500' },
    ]);
  });
});
