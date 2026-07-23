import { Fragment, type JanuxNode } from '../jsx-runtime';
import { createInstance, type JanuxInstance } from '../runtime/instance';
import type { EventBus } from '../runtime/bus';
import type { ComponentDef, Ctx } from '../define/types';
import { isForeignDef, type ForeignDef } from '../interop';
import { dedupeKey, escapeHtml, renderAttrs, safeKey, VOID_ELEMENTS } from './html';

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
  /**
   * Resolves the foreign runtime (react, react-dom/server) from the APP's
   * context. Injected by the host (vite plugin / CLI) so the SSR copy is the
   * same one the app's own React components import — two copies break hooks.
   */
  foreignImport?: (spec: string) => Promise<any>;
}

interface RenderScope extends RenderOptions {
  registry: RenderRegistry;
  keySeq: Map<string, number>;
  usedKeys: Set<string>;
  i18nKeys?: Set<string>;
  /** Set while rendering inside an island's view: children become nested islands. */
  island?: { name: string; key: string; keySeq: Map<string, number>; usedKeys: Set<string> };
}

function isComponentDef(type: unknown): type is ComponentDef {
  return typeof type === 'object' && type !== null && 'kind' in (type as any);
}

/**
 * Nested-island keys are namespaced by parent (`Parent.parentKey.seq`) so the
 * client recomputes the exact same id when the parent re-renders — the SSR and
 * client traversals are both depth-first, so sequence numbers always agree.
 */
function nextKey(scope: RenderScope, def: ComponentDef, explicit?: string): string {
  const prefix = scope.island ? `${scope.island.name}.${scope.island.key}.` : '';
  const used = scope.island?.usedKeys ?? scope.usedKeys;

  if (explicit) return dedupeKey(`${prefix}${safeKey(explicit)}`, used);
  const seqMap = scope.island?.keySeq ?? scope.keySeq;
  const seq = (seqMap.get(def.name) ?? 0) + 1;

  seqMap.set(def.name, seq);
  if (scope.island) return `${prefix}${seq}`;

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

/** Islands render with a recording `t`, so the page can ship only the messages they consume. */
function islandCtx(scope: RenderScope): RenderOptions['ctx'] {
  const i18n = scope.ctx?.i18n;
  const record = scope.i18nKeys;

  if (!i18n || !record) return scope.ctx;
  const t = ((key: string, query?: unknown, options?: unknown) => {
    record.add(String(key));

    return (i18n.t as any)(key, query, options);
  }) as typeof i18n.t;

  return { ...scope.ctx, i18n: { ...i18n, t } };
}

async function renderIsland(def: ComponentDef, props: any, scope: RenderScope): Promise<string> {
  const key = nextKey(scope, def, props.key ?? props.id);
  const stores = storeInstances(scope);
  const useStores = Object.fromEntries(
    Object.keys(def.use ?? {}).map((alias) => [alias, stores[alias]!]),
  );
  const initial = scope.initialState?.[`ui://${def.name}#${key}`] ?? props.initial;
  const instance = createInstance(def, { key, ctx: islandCtx(scope), bus: scope.bus, initial, stores: useStores });

  await loadSources(instance);
  scope.registry.islands.push({ def, key, instance });
  const childScope: RenderScope = {
    ...scope,
    island: { name: def.name, key, keySeq: new Map(), usedKeys: new Set() },
  };
  const inner = await renderNode(def.view!(instance.bag), childScope);
  const persist = props.persist ? ' data-jx-persist' : '';
  const eager = props.eager ? ' data-jx-eager' : '';

  return `<janux-island data-jx="${escapeHtml(`${def.name}#${key}`)}"${persist}${eager}>${inner}</janux-island>`;
}

/** CJS/ESM interop for a dynamically imported module. */
function interopDefault(mod: any): any {
  return mod?.default ?? mod;
}

/** SSR markup for a foreign component when its runtime is installed; empty host otherwise. */
async function foreignInner(def: ForeignDef, props: Record<string, unknown>, scope: RenderScope): Promise<string> {
  if (def.options.hydrate === 'only') return '';
  const load = scope.foreignImport ?? ((spec: string) => import(/* @vite-ignore */ spec));

  try {
    const [react, reactServer] = await Promise.all([load('react'), load('react-dom/server')]);
    const reactProps = def.options.props ? def.options.props(props) : props;
    const element = interopDefault(react).createElement(def.component as any, reactProps as any);

    return interopDefault(reactServer).renderToString(element);
  } catch {
    return '';
  }
}

/** Serializable call-site props travel on the host so top-level foreigns can hydrate. */
function foreignPropsAttr(props: Record<string, unknown>, scope: RenderScope): string {
  if (scope.island) return '';
  try {
    return ` data-jxf-props="${escapeHtml(JSON.stringify(props))}"`;
  } catch {
    return '';
  }
}

async function renderForeign(def: ForeignDef, node: JanuxNode, scope: RenderScope): Promise<string> {
  const explicit = node.$k !== undefined ? String(node.$k) : (node.$p.id as string | undefined);
  const key = nextKey(scope, def as unknown as ComponentDef, explicit);
  const id = `${def.name}#${key}`;
  const { children: _children, ...props } = node.$p;
  const inner = await foreignInner(def, props, scope);

  return `<janux-foreign data-jx="${escapeHtml(id)}" data-jxf-hydrate="${def.options.hydrate}"${foreignPropsAttr(props, scope)}>${inner}</janux-foreign>`;
}

/**
 * Internal links get the current locale prefix (Brisa-style). Already-prefixed
 * hrefs — the language-switcher idiom — and `/_janux/*` URLs stay untouched.
 */
function localizedProps(node: JanuxNode, scope: RenderScope): Record<string, unknown> {
  const i18n = scope.ctx?.i18n;
  const href = node.$p.href;

  if (node.$t !== 'a' || !i18n || typeof href !== 'string' || !href.startsWith('/')) return node.$p;
  if (href.startsWith('/_janux')) return node.$p;
  const [, first] = href.split('/');

  if (first && i18n.locales.includes(first)) return node.$p;

  return { ...node.$p, href: `/${i18n.locale}${href === '/' ? '' : href}` };
}

async function renderElement(node: JanuxNode, scope: RenderScope): Promise<string> {
  const tag = node.$t as string;
  const attrs = renderAttrs(localizedProps(node, scope));

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
  if (isForeignDef(jsxNode.$t)) return renderForeign(jsxNode.$t, jsxNode, scope);
  if (typeof jsxNode.$t === 'function') {
    return renderNode((jsxNode.$t as any)(jsxNode.$p), scope);
  }
  // TSX puts `key` in $k (never in props): surface it so `<Island key={locale} />` re-keys the island.
  if (isComponentDef(jsxNode.$t)) {
    const props = jsxNode.$k === undefined ? jsxNode.$p : { key: String(jsxNode.$k), ...jsxNode.$p };

    return renderIsland(jsxNode.$t, props, scope);
  }

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
  /** i18n keys the page's islands resolved during this render. */
  i18nKeys: string[];
}

/** Server-renders a page tree: static components inline, bifacial components as islands. */
export async function renderToString(node: unknown, options: RenderOptions = {}): Promise<RenderResult> {
  const registry: RenderRegistry = { islands: [], stores: new Map() };
  const i18nKeys = options.ctx?.i18n ? new Set<string>() : undefined;
  const scope: RenderScope = { ...options, registry, keySeq: new Map(), usedKeys: new Set(), i18nKeys };
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

  return { html, registry, snapshots: [...islandSnapshots, ...storeSnapshots], i18nKeys: [...(i18nKeys ?? [])] };
}
