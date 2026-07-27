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
  /** An abandoned stream (client gone) stops descending into new work. */
  halted?: () => boolean;
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

/** Where rendered HTML goes: pushed as produced, in document order. */
type Emit = (chunk: string) => void;

async function renderIsland(def: ComponentDef, props: any, scope: RenderScope, emit: Emit): Promise<void> {
  const key = nextKey(scope, def, props.key ?? props.id);
  const stores = storeInstances(scope);
  const useStores = Object.fromEntries(
    Object.keys(def.use ?? {}).map((alias) => [alias, stores[alias]!]),
  );
  const initial = scope.initialState?.[`ui://${def.name}#${key}`] ?? props.initial;
  const instance = createInstance(def, { key, ctx: islandCtx(scope), bus: scope.bus, initial, stores: useStores });
  const persist = props.persist ? ' data-jx-persist' : '';
  const eager = props.eager ? ' data-jx-eager' : '';
  const id = escapeHtml(`${def.name}#${key}`);
  const childScope: RenderScope = {
    ...scope,
    island: { name: def.name, key, keySeq: new Map(), usedKeys: new Set() },
  };

  /*
   * `key` is the same id, for the navigation diff rather than for us: it matches
   * children by `key` (diff-dom-streaming), so a mounted island is either paired
   * with its own incoming counterpart or removed — never morphed against a
   * different island, which used to leave fragments of an editor or a canvas in
   * the next page. Identity in the markup is what lets that diff read the page as
   * a stream instead of waiting for all of it.
   *
   * The open tag goes out before the sources load: a slow island holds back its
   * own children, not the rest of the page.
   */
  emit(`<janux-island key="${id}" data-jx="${id}"${persist}${eager}>`);
  await loadSources(instance);
  scope.registry.islands.push({ def, key, instance });
  await renderInto(def.view!(instance.bag), childScope, emit);
  emit('</janux-island>');
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

  const persist = props.persist ? ' data-jx-persist' : '';

  return `<janux-foreign data-jx="${escapeHtml(id)}"${persist} data-jxf-hydrate="${def.options.hydrate}"${foreignPropsAttr(props, scope)}>${inner}</janux-foreign>`;
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

async function renderElement(node: JanuxNode, scope: RenderScope, emit: Emit): Promise<void> {
  const tag = node.$t as string;
  const attrs = renderAttrs(localizedProps(node, scope));

  if (VOID_ELEMENTS.has(tag)) return emit(`<${tag}${attrs}/>`);
  emit(`<${tag}${attrs}>`);
  if (typeof node.$p.dangerHTML === 'string') emit(node.$p.dangerHTML);
  else await renderInto(node.$p.children, scope, emit);
  emit(`</${tag}>`);
}

/**
 * Siblings render in parallel with `Promise.all` — the exact scheduling the
 * string renderer always used, which is what keeps island key assignment
 * aligned with the client's synchronous depth-first traversal (each child's
 * synchronous prefix runs deep-first, in array order, before any sibling's) —
 * while their output streams in document order: the leftmost unfinished child
 * emits straight through, later siblings buffer until every child before them
 * has finished.
 */
async function renderSiblings(nodes: unknown[], scope: RenderScope, emit: Emit): Promise<void> {
  const buffers: string[][] = nodes.map(() => []);
  const finished: boolean[] = nodes.map(() => false);
  let live = 0;
  const advanceLive = () => {
    while (finished[live] && live < nodes.length) {
      live += 1;
      buffers[live]?.forEach(emit);
      if (buffers[live]) buffers[live] = [];
    }
  };

  await Promise.all(
    nodes.map((child, index) =>
      renderInto(child, scope, (chunk) => {
        if (index === live) emit(chunk);
        else buffers[index]!.push(chunk);
      }).then(() => {
        finished[index] = true;
        if (index === live) advanceLive();
      }),
    ),
  );
}

async function renderInto(node: unknown, scope: RenderScope, emit: Emit): Promise<void> {
  if (scope.halted?.()) return;
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') return emit(escapeHtml(node));
  if (Array.isArray(node)) {
    // One child needs no buffering machinery — and single-child arrays are
    // what JSX produces most of the time.
    if (node.length === 1) return renderInto(node[0], scope, emit);

    return renderSiblings(node, scope, emit);
  }
  const jsxNode = node as JanuxNode;

  if (jsxNode.$t === Fragment) return renderInto(jsxNode.$p.children, scope, emit);
  if (isForeignDef(jsxNode.$t)) return emit(await renderForeign(jsxNode.$t, jsxNode, scope));
  if (typeof jsxNode.$t === 'function') {
    return renderInto((jsxNode.$t as any)(jsxNode.$p), scope, emit);
  }
  // TSX puts `key` in $k (never in props): surface it so `<Island key={locale} />` re-keys the island.
  if (isComponentDef(jsxNode.$t)) {
    const props = jsxNode.$k === undefined ? jsxNode.$p : { key: String(jsxNode.$k), ...jsxNode.$p };

    return renderIsland(jsxNode.$t, props, scope, emit);
  }

  return renderElement(jsxNode, scope, emit);
}

/** One node's HTML, buffered. The streaming renderer is `renderInto`. */
export async function renderNode(node: unknown, scope: RenderScope): Promise<string> {
  const parts: string[] = [];

  await renderInto(node, scope, (chunk) => parts.push(chunk));

  return parts.join('');
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

function collectSnapshots(registry: RenderRegistry): Snapshot[] {
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

  return [...islandSnapshots, ...storeSnapshots];
}

export interface RenderStream {
  /** Page HTML, in document order, flushed as each part resolves. */
  chunks: AsyncGenerator<string>;
  /** Resolves once `chunks` is fully consumed — snapshots exist only then. */
  done: Promise<Omit<RenderResult, 'html'>>;
  /**
   * Stop rendering: the response was abandoned (client gone), so no new
   * island work starts and `done` settles with what rendered. Explicit rather
   * than via the generator protocol — `chunks.return()` cannot reach a
   * renderer parked on its own await until it yields again.
   */
  cancel(): void;
}

/**
 * Merges chunks that are produced back-to-back, flushing only when the
 * renderer genuinely pauses (a source loading, a foreign import) — detected by
 * racing the next chunk against a macrotask. A static subtree is one flush
 * instead of one write per tag, which is what the network and the client-side
 * diff see; nothing is held back at a real await point, so first paint keeps
 * its latency.
 */
async function* coalesce(source: AsyncGenerator<string>): AsyncGenerator<string> {
  const IDLE = Symbol('idle');
  let buffer = '';
  let pending = source.next();

  try {
    while (true) {
      const idle = new Promise<typeof IDLE>((resolve) => setTimeout(() => resolve(IDLE), 0));
      let result = await Promise.race([pending, idle]);

      if (result === IDLE) {
        if (buffer) {
          yield buffer;
          buffer = '';
        }
        result = await pending;
      }
      if (result.done) break;
      buffer += result.value;
      pending = source.next();
    }
  } finally {
    // Also on error: what rendered before the failure still reaches the page.
    if (buffer) yield buffer;
    // And when the consumer abandons us, the abandonment must reach the
    // renderer (its own finally is what stops further work).
    await source.return(undefined);
  }
}

/**
 * Streaming render: HTML goes out as it is produced instead of after the last
 * island resolves — a slow source holds back its own island, not the page. The
 * joined chunks are byte-identical to `renderToString(...).html`.
 */
export function renderToStream(node: unknown, options: RenderOptions = {}): RenderStream {
  const registry: RenderRegistry = { islands: [], stores: new Map() };
  const i18nKeys = options.ctx?.i18n ? new Set<string>() : undefined;
  const queue: string[] = [];
  let wake: (() => void) | undefined;
  let finished = false;
  let failure: unknown;
  let abandoned = false;
  const scope: RenderScope = {
    ...options,
    registry,
    keySeq: new Map(),
    usedKeys: new Set(),
    i18nKeys,
    halted: () => abandoned,
  };
  const { promise: done, resolve: finish } = Promise.withResolvers<Omit<RenderResult, 'html'>>();
  const notify = () => {
    wake?.();
    wake = undefined;
  };

  (async () => {
    try {
      await renderInto(node, scope, (chunk) => {
        queue.push(chunk);
        notify();
      });
    } catch (error) {
      failure = error;
    } finally {
      finished = true;
      notify();
      if (!failure) finish({ registry, snapshots: collectSnapshots(registry), i18nKeys: [...(i18nKeys ?? [])] });
    }
  })();

  async function* chunks(): AsyncGenerator<string> {
    let index = 0;

    try {
      while (!abandoned && (index < queue.length || !finished)) {
        if (index < queue.length) {
          yield queue[index++]!;
          // Flushed chunks must not pile up for the length of a slow response.
          if (index > 256) index -= queue.splice(0, index).length;
        } else await new Promise<void>((resolve) => { wake = resolve; });
      }
      if (failure) throw failure;
    } finally {
      // Also reached when the consumer abandons the generator directly.
      abandoned = true;
    }
  }

  const cancel = () => {
    abandoned = true;
    notify();
  };

  return { chunks: coalesce(chunks()), done, cancel };
}

/** Server-renders a page tree: static components inline, bifacial components as islands. */
export async function renderToString(node: unknown, options: RenderOptions = {}): Promise<RenderResult> {
  const { chunks, done } = renderToStream(node, options);
  const parts: string[] = [];

  for await (const chunk of chunks) parts.push(chunk);

  return { html: parts.join(''), ...(await done) };
}
