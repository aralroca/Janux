import { Fragment, type JanuxNode } from '../jsx-runtime';
import { createInstance, type JanuxInstance } from '../runtime/instance';
import type { EventBus } from '../runtime/bus';
import type { ComponentDef, Ctx } from '../define/types';
import { escapeHtml, renderAttrs, VOID_ELEMENTS } from './html';

export interface IslandRecord {
  def: ComponentDef;
  key: string;
  instance: JanuxInstance;
}

export interface RenderRegistry {
  islands: IslandRecord[];
  stores: Map<string, JanuxInstance>;
}

export interface RenderOptions {
  ctx?: Ctx;
  bus?: EventBus;
  storeDefs?: Record<string, ComponentDef>;
  initialState?: Record<string, Record<string, unknown>>;
}

interface RenderScope extends RenderOptions {
  registry: RenderRegistry;
  keySeq: Map<string, number>;
}

function isComponentDef(type: unknown): type is ComponentDef {
  return typeof type === 'object' && type !== null && 'kind' in (type as any);
}

function nextKey(scope: RenderScope, def: ComponentDef, explicit?: string): string {
  if (explicit) return explicit;
  const seq = (scope.keySeq.get(def.name) ?? 0) + 1;

  scope.keySeq.set(def.name, seq);

  return seq === 1 ? 'default' : `n${seq}`;
}

async function loadSources(instance: JanuxInstance): Promise<void> {
  const readers = Object.values(instance.sources) as { refresh: () => Promise<void> }[];

  await Promise.all(readers.map((reader) => reader.refresh()));
}

function storeInstances(scope: RenderScope): Record<string, JanuxInstance> {
  Object.entries(scope.storeDefs ?? {}).forEach(([alias, def]) => {
    if (scope.registry.stores.has(alias)) return;
    const initial = scope.initialState?.[`store://${def.name}`];

    scope.registry.stores.set(alias, createInstance(def, { bus: scope.bus, ctx: scope.ctx, initial }));
  });

  return Object.fromEntries(scope.registry.stores);
}

async function renderIsland(def: ComponentDef, props: any, scope: RenderScope): Promise<string> {
  const key = nextKey(scope, def, props.key ?? props.id);
  const stores = storeInstances(scope);
  const useStores = Object.fromEntries(
    Object.keys(def.use ?? {}).map((alias) => [alias, stores[alias]!]),
  );
  const initial = scope.initialState?.[`ui://${def.name}#${key}`] ?? props.initial;
  const instance = createInstance(def, { key, ctx: scope.ctx, bus: scope.bus, initial, stores: useStores });

  await loadSources(instance);
  scope.registry.islands.push({ def, key, instance });
  const inner = await renderNode(def.view!(instance.bag), scope);

  return `<janux-island data-jx="${escapeHtml(`${def.name}#${key}`)}">${inner}</janux-island>`;
}

async function renderElement(node: JanuxNode, scope: RenderScope): Promise<string> {
  const tag = node.$t as string;
  const attrs = renderAttrs(node.$p);

  if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrs}/>`;
  const children =
    typeof node.$p.dangerHTML === 'string'
      ? node.$p.dangerHTML
      : await renderNode(node.$p.children, scope);

  return `<${tag}${attrs}>${children}</${tag}>`;
}

export async function renderNode(node: unknown, scope: RenderScope): Promise<string> {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node);
  if (Array.isArray(node)) {
    const parts = await Promise.all(node.map((child) => renderNode(child, scope)));

    return parts.join('');
  }
  const jsxNode = node as JanuxNode;

  if (jsxNode.$t === Fragment) return renderNode(jsxNode.$p.children, scope);
  if (typeof jsxNode.$t === 'function') {
    return renderNode((jsxNode.$t as any)(jsxNode.$p), scope);
  }
  if (isComponentDef(jsxNode.$t)) return renderIsland(jsxNode.$t, jsxNode.$p, scope);

  return renderElement(jsxNode, scope);
}

export interface Snapshot {
  uri: string;
  state: Record<string, unknown>;
  sources?: Record<string, { value: unknown }>;
}

export interface RenderResult {
  html: string;
  registry: RenderRegistry;
  snapshots: Snapshot[];
}

/** Server-renders a page tree: static components inline, bifacial components as islands. */
export async function renderToString(node: unknown, options: RenderOptions = {}): Promise<RenderResult> {
  const registry: RenderRegistry = { islands: [], stores: new Map() };
  const scope: RenderScope = { ...options, registry, keySeq: new Map() };
  const html = await renderNode(node, scope);
  const islandSnapshots = registry.islands
    .filter(({ def }) => def.state || def.sources)
    .map(({ instance }) => ({
      uri: instance.uri,
      state: instance.snapshot(),
      sources: instance.sourcesSnapshot(),
    }));
  const storeSnapshots = [...registry.stores.values()].map((instance) => ({
    uri: instance.uri,
    state: instance.snapshot(),
    sources: instance.sourcesSnapshot(),
  }));

  return { html, registry, snapshots: [...islandSnapshots, ...storeSnapshots] };
}
