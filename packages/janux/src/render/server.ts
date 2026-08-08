import { Fragment, type JanuxNode } from '../jsx-runtime';
import { createInstance, type InstanceOptions, type JanuxInstance } from '../runtime/instance';
import type { EventBus } from '../runtime/bus';
import type { ComponentDef, Ctx } from '../define/types';
import { isForeignDef, type ForeignDef } from '../interop';
import { isTracing, withSpan } from '../observability/tracing';
import { renderForeignToString } from '../interop/ssr';
import { dedupeKey, escapeHtml, nonceAttr, renderAttrs, safeJson, safeKey, VOID_ELEMENTS } from './html';
import { UNSUSPENSE_RUNTIME } from './unsuspense';

export interface IslandRecord {
  def: ComponentDef;
  key: string;
  instance: JanuxInstance;
}

export interface RenderRegistry {
  islands: IslandRecord[];
  /** Foreign hosts met during the render — a page with any needs the runtime to mount them. */
  foreigns: ForeignDef[];
  stores: Map<string, JanuxInstance>;
}

export interface RenderOptions {
  ctx?: Ctx;
  bus?: EventBus;
  storeDefs?: Record<string, ComponentDef>;
  initialState?: Record<string, Record<string, unknown>>;
  /**
   * Audit and proposal hooks for the instances this render mounts. SSR itself
   * never invokes an intent, so a page request passes none; a host that renders
   * in order to *call* one — `janux run` — needs them, because a `confirm`
   * guard hands the parked `Proposal` (and with it, the only way to execute it)
   * to `onProposal` and nowhere else.
   */
  hooks?: Pick<InstanceOptions, 'onAudit' | 'onProposal' | 'proposalDiff'>;
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
  /**
   * CSP nonce for the inline scripts the renderer emits of its own — the
   * unsuspense runtime, each boundary's swap call, the fail-soft reporter.
   * Under a strict `script-src` an unnonced one is a boundary that never
   * reveals. Absent ⇒ no attribute, exactly as before.
   */
  nonce?: string;
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

    scope.registry.stores.set(alias, createInstance(def, { ...scope.hooks, bus: scope.bus, ctx: scope.ctx, initial }));
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
function failSoftScript(id: string, error: unknown, nonce?: string): string {
  const detail = safeJson(String(error));

  return `<script id="jxe:${id}" key="jxe:${id}"${nonceAttr(nonce)}>document.dispatchEvent(new CustomEvent("janux:error",{detail:${detail}}));console.error("Janux: island failed",${detail})</script>`;
}

/**
 * Children of a guarded or suspended island register apart — islands and
 * boundaries both — so a discarded subtree neither boots on the client nor
 * flushes trailing content for a host that will never exist.
 */
function isolatedScope(scope: RenderScope): RenderScope {
  return {
    ...scope,
    registry: { islands: [], foreigns: scope.registry.foreigns, stores: scope.registry.stores },
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
    registry: { islands: [], foreigns: scope.registry.foreigns, stores: scope.registry.stores },
  };
}

/**
 * Moves what the isolated subtree produced into the scope that owns the page.
 *
 * A one-shot copy is not enough: a boundary NESTED in this content registers
 * its own island only when its sources load — after this content promise
 * settled — and a boundary nested in THAT one is not even known yet. So the
 * isolated scope is drained again every time a boundary adopted from it
 * settles. Copied once, a two-level nesting lost the inner chunk entirely
 * (its content never reached the page) and the inner island shipped no
 * snapshot, so it booted on the client with nothing.
 */
function adopt(scope: RenderScope, isolated: RenderScope): void {
  scope.registry.islands.push(...isolated.registry.islands.splice(0));
  const nested = isolated.boundaries?.splice(0) ?? [];

  scope.boundaries?.push(
    ...nested.map((boundary) => ({
      ...boundary,
      content: boundary.content.finally(() => adopt(scope, isolated)),
    })),
  );
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

    adopt(scope, isolated);

    return { html };
  } catch (error) {
    if (def.error) return { html: await renderNode(def.error({ ...instance.bag, error }), errorScope(scope)) };

    return { html: '', failed: error };
  }
}

const IDLE = Symbol('idle');

/**
 * "The microtask queue has drained" — the signal that a boundary's content is
 * genuinely waiting on I/O rather than on a few more `.then`s.
 *
 * `setTimeout(…, 0)` says that too, but Node clamps a zero timer to 1ms, and
 * that 1ms landed whole on the shell's time-to-first-byte: every streaming page
 * paid ~1.4ms to emit a shell React emits in 0.06ms. `setImmediate` fires in
 * the check phase of the SAME loop turn, after microtasks, so the race stays
 * exactly as deterministic and stops costing a timer tick.
 */
function afterMicrotasks(): Promise<typeof IDLE> {
  return new Promise<typeof IDLE>((resolve) => {
    if (typeof setImmediate === 'function') setImmediate(() => resolve(IDLE));
    else setTimeout(() => resolve(IDLE), 0);
  });
}

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
  const first = await Promise.race([content, afterMicrotasks()]);

  if (first !== IDLE) return emitBoundaryInline(first, emit, id, open, scope.nonce);
  emit(`${open} data-jx-pending>`);
  try {
    await renderInto(def.suspense!(instance.bag), fallbackScope(scope), emit);
  } catch (error) {
    // A broken fallback must not break the boundary: the island still closes,
    // the content still swaps in, and the failure is reported.
    emit(failSoftScript(id, error, scope.nonce));
  }
  emit('</janux-island>');
  scope.boundaries!.push({ id, content });
}

/** A boundary resolved in place: content (or error view) between the island's own tags. */
function emitBoundaryInline(result: BoundaryResult, emit: Emit, id: string, open: string, nonce?: string): void {
  emit(`${open}>`);
  emit(result.html);
  emit('</janux-island>');
  if (result.failed !== undefined) emit(failSoftScript(id, result.failed, nonce));
}

/**
 * One span per island — the unit an operator actually tunes, since an island is
 * what re-renders and what ships JS. A suspended island's span covers what it
 * contributed to *this* flush (its fallback); the deferred content arrives on
 * its own chunk, after the span closed.
 */
function renderIsland(def: ComponentDef, props: any, scope: RenderScope, emit: Emit): Promise<void> {
  // The guard is not redundant with the one inside `withSpan`: reaching it at
  // all means allocating the two closures below, per island, on every render.
  // That was measurable on the SSR benchmark — and "no instrumentation, no
  // cost" is the promise this feature is allowed to exist under.
  if (!isTracing()) return renderIslandInto(def, props, scope, emit);

  return withSpan('janux.island', () => ({ 'janux.island': def.name }), () => renderIslandInto(def, props, scope, emit));
}

async function renderIslandInto(def: ComponentDef, props: any, scope: RenderScope, emit: Emit): Promise<void> {
  const key = nextKey(scope, def, props.key ?? props.id);
  const stores = storeInstances(scope);
  const missing = Object.keys(def.use ?? {}).filter((alias) => !stores[alias]);

  // Failing here beats the mid-stream TypeError this used to become: SSR keys
  // stores by the storeDefs (export) names, so an alias mismatch is an app bug
  // the message must be able to point at.
  if (missing.length) {
    const known = Object.keys(stores).join(', ') || 'none';

    throw new Error(
      `Janux: store "${missing[0]}" used by island "${def.name}" is not registered — available stores: ${known}. ` +
        'The `use` alias must match the export name in your stores module.',
    );
  }
  const useStores = Object.fromEntries(
    Object.keys(def.use ?? {}).map((alias) => [alias, stores[alias]!]),
  );
  const initial = scope.initialState?.[`ui://${def.name}#${key}`] ?? props.initial;
  const instance = createInstance(def, { ...scope.hooks, key, ctx: islandCtx(scope), bus: scope.bus, initial, stores: useStores });
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
    return emitBoundaryInline(await renderBoundaryContent(def, instance, childScope), emit, id, open, scope.nonce);
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

/** SSR markup for a foreign component when its runtime is installed; empty host otherwise. */
function foreignInner(def: ForeignDef, props: Record<string, unknown>, scope: RenderScope): Promise<string> {
  return renderForeignToString(def, props, scope.foreignImport ?? ((spec: string) => import(/* @vite-ignore */ spec)));
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

  scope.registry.foreigns.push(def);
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
  // `//host/path` is a network-path reference (RFC 3986) — another host, not a
  // page of this app: prefixing it would reroute a CDN URL into the router.
  if (href.startsWith('//') || href.startsWith('/_janux')) return node.$p;
  const [, first] = href.split('/');

  if (first && i18n.locales.includes(first)) return node.$p;

  return { ...node.$p, href: `/${i18n.locale}${href === '/' ? '' : href}` };
}

/**
 * Tags a strict CSP refuses without a nonce. A `<script>` or `<style>` written
 * in JSX is the app's own, but the nonce is minted per request, so the app
 * cannot write it — the renderer does, unless the view declared one itself.
 */
const NONCEABLE_TAGS = new Set(['script', 'style']);

function renderElement(node: JanuxNode, scope: RenderScope, emit: Emit): Rendered {
  const tag = node.$t as string;
  const props = localizedProps(node, scope);
  const attrs = renderAttrs(props);
  const cspAttr = NONCEABLE_TAGS.has(tag) && props.nonce === undefined ? nonceAttr(scope.nonce) : '';

  if (VOID_ELEMENTS.has(tag)) return void emit(`<${tag}${attrs}/>`);
  emit(`<${tag}${attrs}${cspAttr}>`);
  const close = `</${tag}>`;
  let children: Rendered = undefined;

  try {
    if (typeof node.$p.dangerHTML === 'string') emit(node.$p.dangerHTML);
    else children = renderInto(node.$p.children, scope, emit);
  } catch (error) {
    // Elements close as the stack unwinds, so an error boundary up the tree
    // always receives balanced markup.
    emit(close);
    throw error;
  }
  if (!isPending(children)) return void emit(close);

  return children.then(
    () => emit(close),
    (error) => {
      emit(close);
      throw error;
    },
  );
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
/**
 * The common case: every child finishes synchronously, so they emit straight
 * through in document order and none of the ordering machinery below is even
 * allocated. Only the first child that actually parks hands over to
 * `renderSiblingsFrom`.
 */
function renderSiblings(nodes: unknown[], scope: RenderScope, emit: Emit): Rendered {
  for (let index = 0; index < nodes.length; index += 1) {
    let rendered: Rendered = undefined;
    let failure: { error: unknown } | undefined;

    try {
      rendered = renderInto(nodes[index], scope, emit);
    } catch (error) {
      failure = { error };
    }
    if (failure !== undefined) return renderSiblingsFrom(nodes, index, scope, emit, Promise.reject(failure.error));
    if (isPending(rendered)) return renderSiblingsFrom(nodes, index, scope, emit, rendered);
  }

  return;
}

/**
 * From the first child that parked onwards. That child is the live cursor, so
 * it keeps emitting straight through; every later sibling still STARTS now (the
 * key-assignment order the client's depth-first walk recomputes depends on it)
 * but buffers its output until every child before it has finished.
 */
function renderSiblingsFrom(
  nodes: unknown[],
  start: number,
  scope: RenderScope,
  emit: Emit,
  first: Promise<void>,
): Rendered {
  const rest = nodes.length - start;
  const buffers: string[][] = Array.from({ length: rest }, () => []);
  const finished: boolean[] = new Array(rest).fill(false);
  let live = 0;
  const advanceLive = () => {
    while (finished[live] && live < rest) {
      live += 1;
      buffers[live]?.forEach(emit);
      if (buffers[live]) buffers[live] = [];
    }
  };
  // Also on rejection: a failed child releases the cursor, so what its later
  // siblings rendered still reaches the page before the throw does.
  const settle = (index: number) => {
    finished[index] = true;
    if (index === live) advanceLive();
  };
  const track = (index: number, rendered: Promise<void>) =>
    rendered.then(
      () => settle(index),
      (error) => {
        settle(index);
        throw error;
      },
    );
  const renders: Promise<void>[] = [track(0, first)];

  for (let offset = 1; offset < rest; offset += 1) {
    const index = offset;
    let rendered: Rendered = undefined;
    let failure: { error: unknown } | undefined;

    // A child that throws on the spot must not stop its later siblings from
    // starting, and must still surface as a rejection — which is what the
    // all-async renderer got for free from `async`.
    try {
      rendered = renderInto(nodes[start + index], scope, (chunk) => {
        if (index === live) emit(chunk);
        else buffers[index]!.push(chunk);
      });
    } catch (error) {
      failure = { error };
    }
    if (failure !== undefined) {
      settle(index);
      renders.push(Promise.reject(failure.error));
      continue;
    }
    if (!isPending(rendered)) {
      settle(index);
      continue;
    }
    renders.push(track(index, rendered));
  }

  return awaitSiblings(renders, scope);
}

async function awaitSiblings(renders: Promise<void>[], scope: RenderScope): Promise<void> {
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

/**
 * A render that is either already finished or still pending. Most of a page is
 * plain markup, and making every node an `async` function charged it one promise
 * and one microtask each — which is the whole shell-emission cost, not the
 * string work. Only islands, foreign roots and suspense boundaries actually
 * await anything.
 */
type Rendered = void | Promise<void>;

/** Thenable, not `!== undefined`: `emit` is often `parts.push`, which returns a number. */
function isPending(rendered: Rendered): rendered is Promise<void> {
  return typeof (rendered as Promise<void> | undefined)?.then === 'function';
}

function renderInto(node: unknown, scope: RenderScope, emit: Emit): Rendered {
  if (scope.halted?.()) return;
  if (node === null || node === undefined || typeof node === 'boolean') return;
  // `bigint` renders as text like `number` does (React ≥19 and Vue agree) —
  // falling through used to reach `renderElement` and crash on `node.$p`.
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    return void emit(escapeHtml(node));
  }
  if (Array.isArray(node)) {
    // One child needs no buffering machinery — and single-child arrays are
    // what JSX produces most of the time.
    if (node.length === 1) return renderInto(node[0], scope, emit);

    return renderSiblings(node, scope, emit);
  }
  // A reactive text binding: the server has no effects, so it renders the value
  // the thunk has now — exactly what the client's first render will show.
  if (typeof node === 'function') return renderInto((node as () => unknown)(), scope, emit);
  const jsxNode = node as JanuxNode;

  if (jsxNode.$t === Fragment) return renderInto(jsxNode.$p.children, scope, emit);
  if (isForeignDef(jsxNode.$t)) {
    return renderForeign(jsxNode.$t, jsxNode, scope).then((html) => emit(html));
  }
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
function completionChunk(boundary: BoundaryRecord, result: BoundaryResult, runtimeSent: boolean, nonce?: string): string {
  const runtime = runtimeSent ? '' : UNSUSPENSE_RUNTIME;
  const call = `<script data-jxu-run id="jxs:${boundary.id}" key="jxu:${boundary.id}"${nonceAttr(nonce)}>${runtime}jx$u(${safeJson(boundary.id)},document.currentScript)</script>`;
  const failed = result.failed === undefined ? '' : failSoftScript(boundary.id, result.failed, nonce);

  // The trailing empty template is for the NAVIGATION diff: its walker holds a
  // chunk's last node until a following sibling proves it complete, which
  // would delay this chunk's swap until the NEXT boundary arrives — boundaries
  // would all reveal together at stream end instead of one by one. The inert
  // sentinel is that following sibling, so the template and the call script
  // apply the moment their own chunk lands. (A first load's parser inserts
  // nodes as they arrive and just ignores it.)
  //
  // The sentinel is also the one boundary node that stays in the settled DOM
  // (jx$u consumes the template, the call script removes itself), so like its
  // siblings it needs a per-boundary key: unkeyed, a later navigation's diff
  // would morph the NEXT page's content template into it in place — and a
  // template morph never syncs content (it lives in `.content`, invisible to
  // the child walker), so jx$u would swap an empty fragment into the island.
  return `<template id="jxu:${boundary.id}" key="jxt:${boundary.id}">${result.html}</template>${call}${failed}<template data-jxs key="jxq:${boundary.id}"></template>`;
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
    emit(completionChunk(next.boundary, next.result, runtimeSent, scope.nonce));
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
  const registry: RenderRegistry = { islands: [], foreigns: [], stores: new Map() };
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
