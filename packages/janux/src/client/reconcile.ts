import { Fragment, type JanuxNode } from '../jsx-runtime';
import { attrEntries } from '../render/html';
import { isForeignDef } from '../interop';
import { isFor, readEach, type ForProps } from '../for';
import { effect as watch, onCleanup, runWithOwner, signal, untrack, type Owner, type Sig } from '../signals';
import { scheduleRender } from '../runtime/render-queue';
import { elementShell, isComponentDef, svgChildren, toDomNodes, type RenderPass } from './dom';
import { ensureListenerForAttr } from './events';
import { claimedElsewhere, nodeKey, setNodeKey } from './keys';
import { isIsland, isValueControl, keepRuntimeClasses, VALUE_CONTROL_TAGS } from './morph';

/**
 * JSX-against-DOM reconciliation for the island render loop. The previous
 * pipeline materialized the WHOLE next view as real DOM (`toDomNodes`) and
 * then morphed the live tree against it — every interaction paid one full
 * createElement/setAttribute pass for a tree that was thrown away. Here the
 * JSX drives the walk directly: live nodes are reused (by render key when both
 * sides carry one, by position+tag otherwise), only their changed attributes
 * are written, and real DOM is created just for the slots that have no match.
 * Islands and foreign hosts stay opaque boundaries reused by id, exactly as
 * in `morph` — which remains the DOM-vs-DOM patcher for resumed markup.
 */

type Slot = JanuxNode | string;

/** Flattens a view tree into element/island/foreign/text slots, invoking plain function components. */
function normalize(node: unknown, out: Slot[]): Slot[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));

    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => normalize(child, out));

    return out;
  }
  const jsxNode = node as JanuxNode;

  if (jsxNode.$t === Fragment) return normalize(jsxNode.$p.children, out);
  // A `<For>` is NOT expanded here: expanding it would put every row back in the
  // island's single render scope, which is exactly the cost it exists to remove.
  if (typeof jsxNode.$t === 'function') {
    if (isFor(jsxNode.$t)) {
      out.push(jsxNode);

      return out;
    }

    return normalize((jsxNode.$t as any)(jsxNode.$p), out);
  }
  out.push(jsxNode);

  return out;
}

function isBoundarySlot(slot: Slot): boolean {
  return typeof slot !== 'string' && (isComponentDef(slot.$t) || isForeignDef(slot.$t));
}

function isForSlot(slot: Slot): slot is JanuxNode {
  return typeof slot !== 'string' && isFor(slot.$t);
}

/**
 * The JSX node most recently reconciled into a live element — its props feed
 * the `sameProps` attr-diff skip. Identity of the node itself must NOT skip
 * the subtree: hoisted JSX wraps dynamic content (function components,
 * signal reads), and skipping recursion would freeze it AND drop the render
 * effect's re-tracked subscriptions.
 */
const prevJsx = new WeakMap<Element, JanuxNode>();

/**
 * Value-equal props on a fresh JSX node ⇒ the serialized attributes cannot
 * have changed, so the whole attr diff (serialize + DOM reads) is skipped.
 * Children are excluded (recursion handles them); value controls still get
 * their property sync — DOM value drift with unchanged state must heal.
 */
function sameProps(prev: Record<string, unknown> | undefined, next: Record<string, unknown>): boolean {
  if (prev === undefined) return false;
  if (prev === next) return true;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) return false;

  return nextKeys.every((key) => key === 'children' || sameValue(prev[key], next[key]));
}

/**
 * `intents.foo.with(input)` builds a FRESH bound ref every render, so identity
 * alone would re-serialize every row's event markers each pass. Two bound refs
 * are the same prop when they name the same intent with value-equal input —
 * which is exactly when their serialized marker + data-input are identical.
 */
function sameValue(a: unknown, b: unknown): boolean {
  const ia = (a as any)?.$intent;
  const ib = (b as any)?.$intent;

  if (ia && ib) {
    if (ia.component !== ib.component || ia.name !== ib.name || ia.key !== ib.key) return false;
    const inputA = (a as any).$input as Record<string, unknown> | undefined;
    const inputB = (b as any).$input as Record<string, unknown> | undefined;

    // The common unbound ref (`onClick={intents.run}`) carries no input at all.
    if (inputA === undefined && inputB === undefined) return true;

    return sameRecord(inputA ?? {}, inputB ?? {});
  }
  // A mutable object (a `style`, an arbitrary bag) can be edited in place, so
  // its identity proves nothing — always re-serialize.
  if (typeof a === 'object' && a !== null) return false;

  return Object.is(a, b);
}

/** Shallow value equality over every key — the `$input` comparison excludes nothing. */
function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  return bKeys.every((key) => sameValue(a[key], b[key]));
}

/** Controlled inputs: state → DOM property writes, never touching the focused control. */
function syncControl(el: Element, props: Record<string, unknown>): void {
  if (!isValueControl(el) || document.activeElement === el) return;
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const checked = props.checked === true;

    if (el.checked !== checked) el.checked = checked;

    return;
  }
  const children = props.children;
  const value =
    props.value !== null && props.value !== undefined
      ? String(props.value)
      : el instanceof HTMLTextAreaElement && (typeof children === 'string' || typeof children === 'number')
        ? String(children)
        : null;

  if (value !== null && el.value !== value) el.value = value;
}

/** Diffs the element's attributes against the serialized form of `props`, like SSR/`elementFor` write them. */
function syncAttrs(el: Element, props: Record<string, unknown>): void {
  const desired = new Map<string, string>();

  attrEntries(props).forEach(([name, value]) => {
    if (value === false || value === null || value === undefined) return;
    desired.set(name, value === true ? '' : String(value));
  });
  keepRuntimeClasses(el, () => {
    el.getAttributeNames()
      .filter((name) => !desired.has(name))
      .forEach((name) => el.removeAttribute(name));
    desired.forEach((value, name) => {
      // A client render can bind an event the page had never used before this pass.
      ensureListenerForAttr(name);
      if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    });
  });
}

/** Reconciles a reused element in place: attrs, children, then control properties. */
function syncElement(el: Element, node: JanuxNode, pass: RenderPass, svg: boolean): void {
  const prev = prevJsx.get(el);

  prevJsx.set(el, node);
  if (node.$k !== undefined) setNodeKey(el, node.$k);
  if (!sameProps(prev?.$p, node.$p)) syncAttrs(el, node.$p);
  if (typeof node.$p.dangerHTML === 'string') {
    if (el.innerHTML !== node.$p.dangerHTML) el.innerHTML = node.$p.dangerHTML;
  } else {
    reconcileChildren(el, node.$p.children, pass, svgChildren(node, svg));
  }
  // AFTER the children: `<select>.value` can only select an <option> that
  // already exists — written first, a value+options change in one pass left
  // the old selection in place.
  if (VALUE_CONTROL_TAGS.has(node.$t as string)) syncControl(el, node.$p);
}

/**
 * A brand-new element for a slot with no live match. The children go through
 * `reconcileChildren`, not `toDomNodes`, so a `<For>` nested in a subtree that
 * is being created for the first time still gets its per-row scopes.
 */
function createElementSlot(node: JanuxNode, pass: RenderPass, svg: boolean): Element {
  const el = elementShell(node, svg);

  prevJsx.set(el, node);
  if (typeof node.$p.dangerHTML === 'string') el.innerHTML = node.$p.dangerHTML;
  else reconcileChildren(el, node.$p.children, pass, svgChildren(node, svg));
  // `elementShell` writes `value` as an ATTRIBUTE, which selects nothing on a
  // fresh <select> (and is only a default for <textarea>) — the property write
  // must run once the options/children exist.
  if (VALUE_CONTROL_TAGS.has(node.$t as string)) syncControl(el, node.$p);

  return el;
}

/** A boundary slot reuses a live host with the same id; the placeholder path assigns ids in pass order. */
function boundaryTarget(slot: JanuxNode, hosts: Map<string, Element> | null, pass: RenderPass, svg: boolean): Node {
  // `toDomNodes` runs the id/key bookkeeping (pass.seq/used + pending lists)
  // for islands and foreigns — identical for a reused host and a fresh one.
  const placeholder = toDomNodes(slot, pass, svg)[0] as Element;
  const host = hosts?.get(placeholder.getAttribute('data-jx')!);

  if (!host) return placeholder;
  // The host's own runtime owns its interior; only the host attrs sync —
  // including dropping the ones this pass no longer declares (persist/eager).
  host
    .getAttributeNames()
    .filter((name) => !placeholder.hasAttribute(name))
    .forEach((name) => host.removeAttribute(name));
  placeholder.getAttributeNames().forEach((name) => {
    if (host.getAttribute(name) !== placeholder.getAttribute(name)) {
      host.setAttribute(name, placeholder.getAttribute(name)!);
    }
  });

  return host;
}

function elementTarget(slot: JanuxNode, match: Match, index: number, pass: RenderPass, svg: boolean): Node {
  const key = slot.$k;
  const survivor = key === undefined ? undefined : match.byKey?.get(key);

  // `localName` is already lowercase for HTML and preserves case for SVG
  // (`foreignObject`), matching JSX intrinsics without per-slot allocations.
  if (survivor && (survivor as Element).localName === slot.$t) {
    syncElement(survivor as Element, slot, pass, svg);

    return survivor;
  }
  const fromKid = match.fromKids[index];
  const fromKey = fromKid === undefined || match.byKey === null ? undefined : nodeKey(fromKid);
  const reusable =
    fromKid !== undefined &&
    !claimedElsewhere(key, fromKey, match.toKeys) &&
    !isIsland(fromKid) &&
    fromKid.nodeType === Node.ELEMENT_NODE &&
    (fromKid as Element).localName === slot.$t;

  if (reusable) {
    syncElement(fromKid as Element, slot, pass, svg);

    return fromKid;
  }

  return createElementSlot(slot, pass, svg);
}

function textTarget(slot: string, match: Match, index: number): Node {
  const fromKid = match.fromKids[index];

  if (fromKid?.nodeType === Node.TEXT_NODE) {
    if (fromKid.textContent !== slot) fromKid.textContent = slot;

    return fromKid;
  }

  return document.createTextNode(slot);
}

interface Match {
  fromKids: ChildNode[];
  /** Built only when a live child carries a render key — the common unkeyed row pays nothing. */
  byKey: Map<string | number, ChildNode> | null;
  /** Built only when an incoming slot carries a key. */
  toKeys: Set<string | number> | null;
  /** Live boundary hosts by island id — built only when one exists among the children. */
  hosts: Map<string, Element> | null;
}

/** One pass over the live children and one over the slots; the key/host machinery is lazy. */
function matchState(root: Element, slots: Slot[]): Match {
  const fromKids: ChildNode[] = [];
  let byKey: Match['byKey'] = null;
  let hosts: Match['hosts'] = null;

  for (let kid = root.firstChild; kid !== null; kid = kid.nextSibling) {
    fromKids.push(kid);
    if (kid.nodeType !== Node.ELEMENT_NODE) continue;
    if (isIsland(kid)) {
      (hosts ??= new Map()).set((kid as Element).getAttribute('data-jx')!, kid as Element);
      continue;
    }
    const key = nodeKey(kid);

    if (key !== undefined) (byKey ??= new Map()).set(key, kid);
  }
  let toKeys: Match['toKeys'] = null;

  slots.forEach((slot) => {
    // A `<For>`'s own key identifies the LIST among its siblings, not a node —
    // it must never enter the DOM-adoption key set.
    if (typeof slot === 'string' || isForSlot(slot)) return;
    if (slot.$k !== undefined) (toKeys ??= new Set()).add(slot.$k);
  });

  return { fromKids, byKey, toKeys, hosts };
}

/**
 * One row of a `<For>`: its own reactive scope, its own DOM node, its own
 * effect. A write only that row reads re-runs only that row's body; the list
 * level never rebuilds a row it did not change.
 */
interface RowScope {
  owner: Owner;
  node: Node;
  itemSig: Sig<unknown>;
  /** Built on first use: a row that ignores its position must not subscribe to it. */
  indexSig: Sig<number> | null;
  index: number;
  /**
   * The row body, deliberately NOT reactive. `{(row) => …}` is a fresh closure
   * on every render of the enclosing view, so tracking its identity would make
   * every parent render re-render every row — the exact cost `<For>` removes.
   * The newest one is kept so a row that DOES re-render runs current code.
   */
  body: (item: unknown, index: () => number) => unknown;
  /** Render stamp of the pass that last claimed this row — an older one is gone. */
  stamp: number;
  /** Position in the PREVIOUS pass — the LIS input, so ordering needs no lookup map. */
  pos: number;
  dispose: () => void;
}

interface ForState {
  rows: Map<unknown, RowScope>;
  stamp: number;
  /**
   * One pass object for the whole list instead of one per row per render. Rows
   * may not contain islands or foreign roots (see `assertPlainRow`), so nothing
   * accumulates in it and it is safe to reuse — 4 allocations per row per render
   * is otherwise the largest single cost of a 1,000-row update.
   */
  pass: RenderPass;
}

/** Per parent element, per `<For>` in it — the list state has to outlive one render. */
const forStates = new WeakMap<Element, Map<string | number, ForState>>();

/**
 * Nested islands and foreign roots need the parent's key/sequence bookkeeping,
 * which a row-local pass cannot supply consistently across re-renders — refused
 * loudly instead of mounting an island that would get a different id on every
 * row update.
 */
function assertPlainRow(pass: RenderPass): void {
  if (pass.islands.length === 0 && pass.foreigns.length === 0) return;
  const name = (pass.islands[0]?.def ?? pass.foreigns[0]?.def)?.name;

  throw new Error(`Janux: <${name}> cannot be rendered inside <For> — lift it out of the row body`);
}

/** The single node a row body must produce. */
function rowSlot(slots: Slot[]): Slot {
  if (slots.length === 1 && !isBoundarySlot(slots[0]!) && !isForSlot(slots[0]!)) return slots[0]!;

  throw new Error(`Janux: a <For> row must render exactly one element, got ${slots.length}`);
}

function rowNodeFor(slot: Slot, live: Node | null, pass: RenderPass, svg: boolean): Node {
  if (typeof slot === 'string') {
    if (live !== null && live.nodeType === Node.TEXT_NODE) {
      if (live.textContent !== slot) live.textContent = slot;

      return live;
    }

    return document.createTextNode(slot);
  }
  const reusable =
    live !== null &&
    live.nodeType === Node.ELEMENT_NODE &&
    !isIsland(live) &&
    (live as Element).localName === slot.$t;

  if (reusable) {
    syncElement(live as Element, slot, pass, svg);

    return live;
  }
  const created = createElementSlot(slot, pass, svg);

  // A row whose root tag changed swaps itself in place; the list level holds the
  // node reference, so the live tree and `scope.node` must not drift apart.
  if (live !== null && live.parentNode !== null) live.parentNode.replaceChild(created, live);

  return created;
}

function createRow(
  state: ForState,
  item: unknown,
  index: number,
  body: (item: unknown, index: () => number) => unknown,
  adopt: Node | undefined,
  svg: boolean,
): RowScope {
  const owner: Owner = { cleanups: [], disposed: false };
  const itemSig = signal(item);
  let node: Node | null = adopt ?? null;
  const scope: RowScope = {
    owner,
    node: null as unknown as Node,
    itemSig,
    indexSig: null,
    index,
    body,
    stamp: 0,
    pos: -1,
    dispose: () => {},
  };
  // An accessor, not a value: a row that never asks for its position does not
  // subscribe to it, so permuting the list re-renders nothing.
  const readIndex = (): number => (scope.indexSig ??= signal(scope.index)).value;

  runWithOwner(owner, () =>
    watch(() => {
      const slot = rowSlot(normalize(scope.body(itemSig.value, readIndex), []));

      node = rowNodeFor(slot, node, state.pass, svg);
      assertPlainRow(state.pass);
    }, scheduleRender),
  );
  scope.node = node!;
  scope.dispose = (): void => {
    if (owner.disposed) return;
    owner.disposed = true;
    untrack(() => owner.cleanups.splice(0).reverse().forEach((cleanup) => cleanup()));
  };

  return scope;
}

/** Pushes this pass's item and index into a surviving row; only a real change re-renders it. */
function updateRow(
  scope: RowScope,
  item: unknown,
  index: number,
  body: (item: unknown, index: () => number) => unknown,
): void {
  scope.body = body;
  scope.index = index;
  untrack(() => {
    if (scope.indexSig !== null && scope.indexSig.peek() !== index) scope.indexSig.value = index;
    if (!sameItem(scope.itemSig.peek(), item)) scope.itemSig.value = item;
  });
}

/**
 * Deep value equality. A row re-renders when its data changed, not when the
 * array that carried it was rebuilt — and a state write stores a defensive
 * clone, so identity alone would call every row dirty after any list write.
 *
 * `for…in` rather than `Object.keys`: this runs once per row per list render,
 * and two throwaway key arrays per row is measurable at 1,000 rows.
 */
function sameItem(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  let count = 0;

  for (const key in a) {
    if (!sameItem((a as any)[key], (b as any)[key])) return false;
    count += 1;
  }
  for (const key in b) {
    count -= 1;
    if (count < 0) return false;
  }

  return count === 0;
}

function forStateFor(root: Element, id: string | number, parent: RenderPass['parent']): ForState {
  const byId = forStates.get(root) ?? new Map<string | number, ForState>();

  forStates.set(root, byId);
  const existing = byId.get(id);

  if (existing) return existing;
  const created: ForState = {
    rows: new Map(),
    stamp: 0,
    pass: { parent, seq: new Map(), used: new Set(), islands: [], foreigns: [] },
  };

  byId.set(id, created);
  // The island scope owns the list: disposing it must stop every row effect.
  onCleanup(() => created.rows.forEach((row) => row.dispose()));

  return created;
}

/**
 * One pass over the list: every row matched by key, its scope updated or built,
 * and `seq[i]` filled with where that row sat LAST pass (-1 when it is new) —
 * which is the LIS input, so ordering needs no node→index map.
 */
function diffRows(
  state: ForState,
  node: JanuxNode,
  order: RowScope[],
  seq: number[],
  adoptAt: ((index: number) => Node | undefined) | null,
  svg: boolean,
): void {
  const props = node.$p as unknown as ForProps<unknown>;
  const items = readEach(props.each);
  const keyOf = props.by;
  const body = props.children as (item: unknown, index: () => number) => unknown;
  const stamp = state.stamp;
  let live = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    // Untracked: the list scope subscribes to the CONTAINER, never to what a key
    // function or a row body happens to read.
    const key = keyOf === undefined ? item : untrack(() => keyOf(item, index));
    let scope = state.rows.get(key);

    if (scope === undefined) {
      scope = createRow(state, item, index, body, adoptAt?.(index), svg);
      state.rows.set(key, scope);
      seq[index] = -1;
    } else {
      seq[index] = scope.pos;
      updateRow(scope, item, index, body);
    }
    if (scope.stamp !== stamp) {
      scope.stamp = stamp;
      live += 1;
    }
    order[index] = scope;
  }
  order.length = items.length;
  seq.length = items.length;
  if (state.rows.size === live) return;
  state.rows.forEach((row, key) => {
    if (row.stamp === stamp) return;
    row.dispose();
    (row.node as ChildNode).remove();
    state.rows.delete(key);
  });
}

/** Remembers this pass's layout so the next one can diff positions without a lookup map. */
function stampPositions(order: RowScope[]): void {
  for (let index = 0; index < order.length; index += 1) order[index]!.pos = index;
}

/**
 * `<tbody><For/></tbody>` — the list owns every child, so none of the
 * key/host/text matching applies and the rows can be placed straight from their
 * previous positions. This is the shape every list has, and skipping the
 * generic machinery is most of what makes a 1,000-row permutation sub-ms.
 */
function reconcileForOnly(root: Element, node: JanuxNode, pass: RenderPass, svg: boolean): void {
  const state = forStateFor(root, node.$k ?? 0, pass.parent);
  const stamp = (state.stamp += 1);
  const order: RowScope[] = [];
  const seq: number[] = [];
  let adopting = stamp === 1 ? root.firstChild : null;
  const adoptAt =
    adopting === null
      ? null
      : (): Node | undefined => {
          const next = adopting;

          adopting = adopting === null ? null : adopting.nextSibling;

          return next ?? undefined;
        };

  diffRows(state, node, order, seq, adoptAt, svg);
  placeRows(root, order, seq);
  // First pass only: whatever the server left in this container that no row
  // claimed (whitespace, a stale row) is not ours to keep.
  if (stamp === 1) sweepUnclaimed(root, order);
  stampPositions(order);
}

function sweepUnclaimed(root: Element, order: RowScope[]): void {
  const owned = new Set<Node>();

  for (let index = 0; index < order.length; index += 1) owned.add(order[index]!.node);
  for (let kid = root.firstChild; kid !== null; ) {
    const next = kid.nextSibling;

    if (!owned.has(kid)) root.removeChild(kid);
    kid = next;
  }
}

/** LIS placement straight off `seq`: survivors in order stay put, everything else moves once. */
function placeRows(root: Element, order: RowScope[], seq: number[]): void {
  let settled = true;

  for (let index = 0; index < seq.length; index += 1) {
    if (seq[index] !== index) {
      settled = false;
      break;
    }
  }
  // Every row sat exactly where it sits now: a content-only update moves nothing.
  if (settled) return;
  const keep = lisMask(seq);
  let anchor: Node | null = null;

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index]!.node;

    if (keep[index] === 1) anchor = node;
    else {
      root.insertBefore(node, anchor);
      anchor = node;
    }
  }
}

/** Diffs the list by key and appends each row's node; row CONTENT is the rows' own business. */
function reconcileFor(
  root: Element,
  slot: JanuxNode,
  id: string | number,
  match: Match,
  targets: Node[],
  pass: RenderPass,
  svg: boolean,
): void {
  const state = forStateFor(root, id, pass.parent);
  const stamp = (state.stamp += 1);
  const offset = targets.length;
  const order: RowScope[] = [];
  const seq: number[] = [];
  // Adoption is a HYDRATION move and only valid on the list's first pass, where
  // the live children are the SSR rows in order. Later on, the node at that
  // position belongs to a surviving row — adopting it would hand one row's node
  // to another and drop a row from the list.
  const adoptAt = stamp === 1 ? (index: number) => match.fromKids[offset + index] : null;

  diffRows(state, slot, order, seq, adoptAt, svg);
  for (let index = 0; index < order.length; index += 1) targets.push(order[index]!.node);
  stampPositions(order);
}

function reconcileChildren(root: Element, children: unknown, pass: RenderPass, svg = false): void {
  const slots = normalize(children, []);

  if (slots.length === 1 && isForSlot(slots[0]!)) return reconcileForOnly(root, slots[0]!, pass, svg);
  const match = matchState(root, slots);
  const targets: Node[] = [];
  // A list always takes the keyed ordering path: its rows carry no DOM key, and
  // the positional walk cascades ~n insertions for a rotation the LIS moves once.
  let keyed = match.byKey !== null || match.toKeys !== null;

  slots.forEach((slot, index) => {
    if (typeof slot === 'string') return void targets.push(textTarget(slot, match, targets.length));
    if (isForSlot(slot)) {
      keyed = true;

      return reconcileFor(root, slot, slot.$k ?? index, match, targets, pass, svg);
    }
    if (isBoundarySlot(slot)) return void targets.push(boundaryTarget(slot, match.hosts, pass, svg));

    targets.push(elementTarget(slot, match, targets.length, pass, svg));
  });

  orderChildren(root, targets, match.fromKids, keyed);
}

/**
 * Longest-increasing-subsequence ordering (the keyed-list technique Ripple,
 * Solid and Vue's reconcilers share): survivors whose relative order already
 * matches stay put; everything else is inserted once, walking end→start so
 * each insertion's anchor is already final. A swap moves 2 nodes, a rotation
 * moves 1 — the positional loop this replaces cascaded ~n insertions for both.
 */
function orderChildren(root: Element, targets: Node[], fromKids: ChildNode[], keyed: boolean): void {
  // Unkeyed children resolve positionally, so the naive index walk is already
  // minimal — and the common leaf case (a row's cells) pays no Set/Map/LIS.
  if (!keyed) {
    targets.forEach((node, index) => {
      if (root.childNodes[index] !== node) root.insertBefore(node, root.childNodes[index] ?? null);
    });
    while (root.childNodes.length > targets.length) root.removeChild(root.lastChild!);

    return;
  }
  const targetSet = new Set(targets);

  fromKids.forEach((kid) => {
    if (!targetSet.has(kid)) root.removeChild(kid);
  });
  const position = new Map(fromKids.map((kid, index) => [kid as Node, index]));
  const keep = lisIndices(targets.map((node) => position.get(node) ?? -1));
  let anchor: Node | null = null;

  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const node = targets[index]!;

    if (keep.has(index)) anchor = node;
    else {
      root.insertBefore(node, anchor);
      anchor = node;
    }
  }
}

/**
 * The same longest-increasing-subsequence pass as `lisIndices`, returning a
 * byte mask instead of a `Set`. Ordering a 1,000-row permutation runs this on
 * every list render, and the mask costs one typed array where the Set costs a
 * thousand hash inserts and a thousand lookups.
 */
function lisMask(seq: number[]): Uint8Array {
  const keep = new Uint8Array(seq.length);
  const tailIndices: number[] = [];
  const prevIndex = new Int32Array(seq.length).fill(-1);

  for (let index = 0; index < seq.length; index += 1) {
    const value = seq[index]!;

    if (value < 0) continue;
    let lo = 0;
    let hi = tailIndices.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;

      if (seq[tailIndices[mid]!]! < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prevIndex[index] = tailIndices[lo - 1]!;
    tailIndices[lo] = index;
  }
  let cursor = tailIndices.length > 0 ? tailIndices[tailIndices.length - 1]! : -1;

  while (cursor >= 0) {
    keep[cursor] = 1;
    cursor = prevIndex[cursor]!;
  }

  return keep;
}

/** Indices forming a longest strictly-increasing subsequence of `seq` (-1 entries never qualify). */
function lisIndices(seq: number[]): Set<number> {
  const tailIndices: number[] = [];
  const prevIndex = new Array<number>(seq.length).fill(-1);

  seq.forEach((value, index) => {
    if (value < 0) return;
    let lo = 0;
    let hi = tailIndices.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;

      if (seq[tailIndices[mid]!]! < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prevIndex[index] = tailIndices[lo - 1]!;
    tailIndices[lo] = index;
  });
  const keep = new Set<number>();
  let cursor = tailIndices.length > 0 ? tailIndices[tailIndices.length - 1]! : -1;

  while (cursor >= 0) {
    keep.add(cursor);
    cursor = prevIndex[cursor]!;
  }

  return keep;
}

/** Patches `root`'s children in place to match the JSX `children` of an island view. */
export function reconcile(root: Element, children: unknown, pass: RenderPass): void {
  reconcileChildren(root, children, pass);
}
