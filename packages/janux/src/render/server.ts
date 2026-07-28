import { Fragment, type JanuxNode } from '../jsx-runtime';
import { createInstance, type JanuxInstance } from '../runtime/instance';
import type { EventBus } from '../runtime/bus';
import type { ComponentDef, Ctx } from '../define/types';
import { isForeignDef, type ForeignDef } from '../interop';
import { dedupeKey, escapeHtml, renderAttrs, safeJson, safeKey, VOID_ELEMENTS } from './html';
import { UNSUSPENSE_RUNTIME } from './unsuspense';

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
  /**
   * Resolve suspense islands in place instead of streaming trailing chunks.
   * `renderToString` forces it: buffered consumers (agent-facing Markdown
   * projections, static export) must never see a skeleton with the real
   * content parked in a `<template>` no one will execute.
   */
  inlineSuspense?: boolean;
  /**
   * Called once when the page's own HTML is complete but suspense boundaries
   * are still pending; the returned markup is emitted before the trailing
   * chunks. The server shell uses it to ship the runtime and the snapshots
   * that already exist — the page becomes interactive while boundaries stream.
   */
  onBeforeBoundaries?: (summary: Omit<RenderResult, 'html'>) => string;
}

/** What a suspended island resolves to — the swap script is error-agnostic. */
interface BoundaryResult {
  html: string;
  /** Set only when the island had no `error` view: reported via `janux:error`. */
  failed?: unknown;
}

interface BoundaryRecord {
  id: string;
  content: Promise<BoundaryResult>;
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
  /** Suspended islands register here; the stream flushes them in resolution order. */
  boundaries?: BoundaryRecord[];
  /** An ancestor island declared `error`: a failing island rethrows to it instead of failing soft. */
  underErrorBoundary?: boolean;
  /**
   * Rendering into a discardable buffer, not the stream: a throwing sibling
   * may reject immediately (nothing has streamed, the whole buffer is dropped)
   * instead of waiting for every sibling to settle first.
   */
  buffered?: boolean;
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

/** The failure is reported in-page: same `janux:error` channel a failed navigation uses. */
function failSoftScript(id: string, error: unknown): string {
  const detail = safeJson(String(error));

  return `<script id="jxe:${id}" key="jxe:${id}">document.dispatchEvent(new CustomEvent("janux:error",{detail:${detail}}));console.error("Janux: island failed",${detail})</script>`;
}

/**
 * Children of a guarded or suspended island register apart — islands and
 * boundaries both — so a discarded subtree neither boots on the client nor
 * flushes trailing content for a host that will never exist.
 */
function isolatedScope(scope: RenderScope): RenderScope {
  return {
    ...scope,
    registry: { islands: [], stores: scope.registry.stores },
    boundaries: scope.boundaries && [],
    buffered: true,
  };
}

/**
 * The error view renders with a fresh key sequence: the discarded attempt
 * consumed keys the client's depth-first walk will never see, and an island
 * keyed off that drift ships state under an identity no client can compute.
 */
function errorScope(scope: RenderScope): RenderScope {
  return { ...scope, island: { ...scope.island!, keySeq: new Map(), usedKeys: new Set() } };
}

/**
 * The fallback's nested islands live in a `~fb` key namespace: they are real
 * islands until the swap removes them, and they must never collide with the
 * keys the real content assigns. Boundaries are disabled inside a fallback —
 * its whole subtree is discarded at swap time, so a trailing chunk registered
 * there could outlive its host.
 */
function fallbackScope(scope: RenderScope): RenderScope {
  const island = scope.island!;

  return {
    ...scope,
    island: { ...island, key: `${island.key}~fb`, keySeq: new Map(), usedKeys: new Set() },
    // No boundaries and no registrations: the whole subtree dies at swap time,
    // so nothing in it may flush trailing chunks, boot, or ship a snapshot.
    boundaries: undefined,
    registry: { islands: [], stores: scope.registry.stores },
  };
}

/**
 * An island body under a boundary: sources load, the island registers, and the
 * subtree renders isolated and buffered — streamed chunks cannot be unstreamed,
 * and an `error` view replaces the content wholesale. A failure with no
 * `error` view comes back as `failed` and the island fails soft on its own:
 * a boundary island never bubbles to an ancestor, whose markup may already be
 * on the wire by the time the failure exists.
 */
async function renderBoundaryContent(def: ComponentDef, instance: JanuxInstance, scope: RenderScope): Promise<BoundaryResult> {
  await loadSources(instance);
  scope.registry.islands.push({ def, key: scope.island!.key, instance });
  const isolated = isolatedScope(scope);

  try {
    const html = await renderNode(def.view!(instance.bag), isolated);

    scope.registry.islands.push(...isolated.registry.islands);
    scope.boundaries?.push(...(isolated.boundaries ?? []));

    return { html };
  } catch (error) {
    if (def.error) return { html: await renderNode(def.error({ ...instance.bag, error }), errorScope(scope)) };

    return { html: '', failed: error };
  }
}

const IDLE = Symbol('idle');

/**
 * Streaming suspense: the real content renders concurrently; if it settles
 * before the fallback would even flush, it is inlined and no boundary exists.
 * The race is deterministic, not load-dependent: the macrotask timer can only
 * fire once the microtask queue drains, which happens exactly when the content
 * either settled or parked on real I/O — so "lost the race" means "actually
 * waits on something".
 */
async function renderSuspended(def: ComponentDef, instance: JanuxInstance, scope: RenderScope, emit: Emit, id: string, open: string): Promise<void> {
  const content = renderBoundaryContent(def, instance, scope);
  const first = await Promise.race([
    content,
    new Promise<typeof IDLE>((resolve) => setTimeout(() => resolve(IDLE), 0)),
  ]);

  if (first !== IDLE) return emitBoundaryInline(first, emit, id, open);
  emit(`${open} data-jx-pending>`);
  try {
    await renderInto(def.suspense!(instance.bag), fallbackScope(scope), emit);
  } catch (error) {
    // A broken fallback must not break the boundary: the island still closes,
    // the content still swaps in, and the failure is reported.
    emit(failSoftScript(id, error));
  }
  emit('</janux-island>');
  scope.boundaries!.push({ id, content });
}

/** A boundary resolved in place: content (or error view) between the island's own tags. */
function emitBoundaryInline(result: BoundaryResult, emit: Emit, id: string, open: string): void {
  emit(`${open}>`);
  emit(result.html);
  emit('</janux-island>');
  if (result.failed !== undefined) emit(failSoftScript(id, result.failed));
}

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
    underErrorBoundary: scope.underErrorBoundary || def.error !== undefined,
  };
  const open = `<janux-island key="${id}" data-jx="${id}"${persist}${eager}`;

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
  if (def.suspense && scope.boundaries) return renderSuspended(def, instance, childScope, emit, id, open);
  if (def.suspense || def.error) {
    // Buffered: an `error` view must be able to replace the content wholesale,
    // and a suspense island in an inline render (`renderToString`, agent-facing
    // projections) resolves in place instead of streaming a trailing chunk.
    return emitBoundaryInline(await renderBoundaryContent(def, instance, childScope), emit, id, open);
  }
  emit(`${open}>`);
  await loadSources(instance);
  scope.registry.islands.push({ def, key, instance });
  try {
    await renderInto(def.view!(instance.bag), childScope, emit);
  } catch (error) {
    // What streamed before the throw stays (elements close on unwind), the
    // island closes, and the failure is dispatched — unless an ancestor island
    // declared `error`, which is the boundary the throw belongs to.
    if (childScope.underErrorBoundary) throw error;
    emit(failSoftScript(id, error));
  }
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
  try {
    if (typeof node.$p.dangerHTML === 'string') emit(node.$p.dangerHTML);
    else await renderInto(node.$p.children, scope, emit);
  } finally {
    // Also on a throw: elements close as the stack unwinds, so an error
    // boundary up the tree always receives balanced markup.
    emit(`</${tag}>`);
  }
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

  const renders = nodes.map((child, index) =>
    renderInto(child, scope, (chunk) => {
      if (index === live) emit(chunk);
      else buffers[index]!.push(chunk);
    }).finally(() => {
      // Also on rejection: a failed child releases the cursor, so what its
      // later siblings rendered still reaches the page before the throw does.
      finished[index] = true;
      if (index === live) advanceLive();
    }),
  );

  // Into a discardable buffer, fail fast: nothing has streamed, the whole
  // buffer is dropped by the boundary above, and waiting would park the error
  // view behind a sibling that may never settle. Into the stream, wait for
  // every sibling: a throwing child must not leave its still-running siblings
  // emitting into a document someone above already closed.
  if (scope.buffered) {
    await Promise.all(renders);

    return;
  }
  const results = await Promise.allSettled(renders);

  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
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
  // Push pump, not a race per chunk: the previous shape raced every raw chunk
  // against a macrotask timer, which allocated a timer (and a race reaction)
  // for each of the ~3 chunks per element. Under a microtask-only render loop
  // — a static export, a benchmark, a busy server draining back-to-back
  // renders — none of those timers ever fired and each pinned its promise
  // machinery: ~800KB retained per render, unbounded growth. Here the pump
  // appends chunks to one buffer and arms AT MOST ONE 0ms timer per flush
  // window; a timer still only fires on a macrotask boundary, which is
  // exactly when the renderer has genuinely paused, so the flush semantics
  // and the emitted bytes are unchanged.
  const flushes: string[] = [];
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  let failure: unknown;
  let abandoned = false;
  let wake: (() => void) | undefined;

  const notify = () => {
    wake?.();
    wake = undefined;
  };
  const flush = () => {
    timer = null;
    if (buffer) {
      flushes.push(buffer);
      buffer = '';
    }
    notify();
  };

  const pump = (async () => {
    try {
      for await (const chunk of source) {
        if (abandoned) break;
        buffer += chunk;
        timer ??= setTimeout(flush, 0);
      }
    } catch (error) {
      failure = error;
    } finally {
      if (timer) clearTimeout(timer);
      // Also on error: what rendered before the failure still reaches the page.
      flush();
      finished = true;
      notify();
    }
  })();

  try {
    while (flushes.length > 0 || !finished) {
      if (flushes.length > 0) yield flushes.shift()!;
      else await new Promise<void>((resolve) => { wake = resolve; });
    }
    if (failure !== undefined) throw failure;
  } finally {
    // When the consumer abandons us, the abandonment must reach the renderer
    // (its own finally is what stops further work).
    abandoned = true;
    await source.return(undefined);
    await pump;
  }
}

const HALT = Symbol('halt');

/**
 * One boundary's trailing chunk: content template + self-removing swap call.
 * The call script carries its own `id` so the navigation script-runner keys it
 * individually instead of by its (per-page-identical) shape.
 */
function completionChunk(boundary: BoundaryRecord, result: BoundaryResult, runtimeSent: boolean): string {
  const runtime = runtimeSent ? '' : UNSUSPENSE_RUNTIME;
  const call = `<script data-jxu-run id="jxs:${boundary.id}" key="jxu:${boundary.id}">${runtime}jx$u(${safeJson(boundary.id)},document.currentScript)</script>`;
  const failed = result.failed === undefined ? '' : failSoftScript(boundary.id, result.failed);

  // The trailing empty template is for the NAVIGATION diff: its walker holds a
  // chunk's last node until a following sibling proves it complete, which
  // would delay this chunk's swap until the NEXT boundary arrives — boundaries
  // would all reveal together at stream end instead of one by one. The inert
  // sentinel is that following sibling, so the template and the call script
  // apply the moment their own chunk lands. (A first load's parser inserts
  // nodes as they arrive and just ignores it.)
  return `<template id="jxu:${boundary.id}" key="jxt:${boundary.id}">${result.html}</template>${call}${failed}<template data-jxs></template>`;
}

/**
 * Trailing chunks flush in resolution order — the runtime rides the first one.
 * The list can grow while flushing: a boundary nested in another's content
 * registers mid-loop. `halt` breaks the wait for a stream the client abandoned,
 * whose gated sources may never resolve.
 */
async function flushBoundaries(scope: RenderScope, emit: Emit, halt: Promise<typeof HALT>): Promise<void> {
  const list = scope.boundaries!;
  let runtimeSent = false;

  while (list.length > 0) {
    const next = await Promise.race([
      halt,
      // A rejecting content promise (an `error` view that itself throws)
      // degrades that one boundary to a fail-soft swap instead of killing
      // every boundary still in flight.
      ...list.map((boundary) =>
        boundary.content.then(
          (result) => ({ boundary, result }),
          (error) => ({ boundary, result: { html: '', failed: error } }),
        ),
      ),
    ]);

    if (next === HALT) return;
    list.splice(list.indexOf(next.boundary), 1);
    emit(completionChunk(next.boundary, next.result, runtimeSent));
    runtimeSent = true;
  }
}

/**
 * Streaming render: HTML goes out as it is produced instead of after the last
 * island resolves — a slow source holds back its own island, not the page. The
 * joined chunks are byte-identical to `renderToString(...).html`, except for
 * suspense boundaries: the stream carries fallback + trailing swap chunks,
 * where the buffered render resolves them in place.
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
    boundaries: options.inlineSuspense ? undefined : [],
  };
  const { promise: done, resolve: finish } = Promise.withResolvers<Omit<RenderResult, 'html'>>();
  const { promise: halt, resolve: releaseHalt } = Promise.withResolvers<typeof HALT>();
  const notify = () => {
    wake?.();
    wake = undefined;
  };

  (async () => {
    const emit = (chunk: string) => {
      queue.push(chunk);
      notify();
    };

    try {
      await renderInto(node, scope, emit);
      if (scope.boundaries?.length) {
        const interlude = options.onBeforeBoundaries?.({
          registry,
          snapshots: collectSnapshots(registry),
          i18nKeys: [...(i18nKeys ?? [])],
        });

        if (interlude) emit(interlude);
        await flushBoundaries(scope, emit, halt);
      }
    } catch (error) {
      failure = error;
    } finally {
      finished = true;
      notify();
      // Also on failure: no promise left dangling per failed render.
      finish({ registry, snapshots: collectSnapshots(registry), i18nKeys: [...(i18nKeys ?? [])] });
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
      releaseHalt(HALT);
    }
  }

  const cancel = () => {
    abandoned = true;
    releaseHalt(HALT);
    notify();
  };

  return { chunks: coalesce(chunks()), done, cancel };
}

/**
 * Server-renders a page tree: static components inline, bifacial components as
 * islands. Suspense islands are resolved in place — a buffered render has no
 * stream for a fallback to be swapped in, so the joined output matches what a
 * streamed page settles into, not the bytes it traveled as.
 */
export async function renderToString(node: unknown, options: RenderOptions = {}): Promise<RenderResult> {
  const { chunks, done } = renderToStream(node, { ...options, inlineSuspense: true });
  const parts: string[] = [];

  for await (const chunk of chunks) parts.push(chunk);

  return { html: parts.join(''), ...(await done) };
}
