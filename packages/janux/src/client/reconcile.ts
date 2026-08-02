import { Fragment, type JanuxNode } from '../jsx-runtime';
import { attrEntries, bindingAttr, isBinding, propToAttr } from '../render/html';
import { isForeignDef } from '../interop';
import { isFor, readEach, type ForProps } from '../for';
import { toRaw } from '../state/raw';
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
  // Two thunks are the same PROP: the value they produce belongs to the
  // binding's own effect, so a fresh closure must not force an attr diff.
  if (typeof a === 'function' && typeof b === 'function') return true;
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
    // A binding owns this property and writes it from its own effect.
    if (isBinding('checked', props.checked)) return;
    const checked = props.checked === true;

    if (el.checked !== checked) el.checked = checked;

    return;
  }
  if (isBinding('value', props.value)) return;
  const children = props.children;
  const value =
    props.value !== null && props.value !== undefined
      ? String(props.value)
      : el instanceof HTMLTextAreaElement && (typeof children === 'string' || typeof children === 'number')
        ? String(children)
        : null;

  if (value !== null && el.value !== value) el.value = value;
}

/**
 * One live effect per reactive prop. `class={() => …}` reads its state inside
 * THIS effect, so the enclosing view never subscribes to it: a write re-runs one
 * attribute write per element instead of one view render. Solid and vue-vapor
 * compile to the same shape; a thunk is how you write it without a compiler.
 */
interface Binding {
  /** The newest thunk. Setting it re-runs the binding — closures are fresh every render. */
  thunk: Sig<() => unknown>;
  /** Last value written. A shared signal re-runs every row's binding; almost none change. */
  last: unknown;
}

/** No value a thunk can return, so the first run always writes. */
const UNWRITTEN = Symbol('unwritten');

const bindings = new WeakMap<Element, Map<string, Binding>>();

/** Writes one bound prop, mapped to its attribute exactly as SSR would write it. */
function applyBinding(el: Element, name: string, value: unknown, binding: Binding): void {
  // Selecting one row of a thousand re-runs a thousand bindings and changes
  // two. Comparing the VALUE first skips the attribute mapping and the DOM read
  // for the other 998.
  if (Object.is(value, binding.last)) return;
  binding.last = value;
  const pair = propToAttr(name, value);

  if (pair === undefined) return;
  const [attr, raw] = pair;
  const write = () => {
    if (raw === false || raw === null || raw === undefined) return void el.removeAttribute(attr);
    const next = raw === true ? '' : String(raw);

    ensureListenerForAttr(attr);
    if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
  };

  // Only `class` can collide with the runtime's own classes, and the guard is
  // not free on a path that runs once per bound attribute per change.
  if (attr === 'class') keepRuntimeClasses(el, write);
  else write();
  // `value`/`checked` are PROPERTIES on a live control: the attribute alone is
  // only a default, and `<select>.value` selects nothing without it.
  if ((name === 'value' || name === 'checked') && isValueControl(el)) writeControlProp(el, name, value);
}

/** The property half of a bound `value`/`checked`, never touching the focused control. */
function writeControlProp(el: Element, name: string, value: unknown): void {
  if (document.activeElement === el) return;
  if (name === 'checked') {
    if (!(el instanceof HTMLInputElement)) return;
    const checked = value === true;

    if (el.checked !== checked) el.checked = checked;

    return;
  }
  const next = value === null || value === undefined ? '' : String(value);
  const control = el as HTMLInputElement;

  if (control.value !== next) control.value = next;
}

/** Attaches (or refreshes) the effect behind every thunk prop on this element. */
function bindProps(el: Element, props: Record<string, unknown>): void {
  const names = Object.keys(props);

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    const thunk = props[name];

    if (!isBinding(name, thunk)) continue;
    let map = bindings.get(el);

    if (map === undefined) {
      map = new Map();
      bindings.set(el, map);
    }
    const live = map.get(name);

    // A re-render brings a fresh closure over fresh data; the effect stays, so
    // whatever it already subscribed to is re-tracked from the new body.
    if (live !== undefined) {
      live.thunk.value = thunk;
      continue;
    }
    const sig = signal(thunk);
    const binding: Binding = { thunk: sig, last: UNWRITTEN };

    map.set(name, binding);
    onCleanup(watch(() => applyBinding(el, name, sig.value(), binding), scheduleRender));
  }
}

/** The attributes this element's bindings own — an attr diff must not reclaim them. */
function boundAttrs(props: Record<string, unknown>): Set<string> | null {
  const names = Object.keys(props);
  let owned: Set<string> | null = null;

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;

    if (!isBinding(name, props[name])) continue;
    const attr = bindingAttr(name);

    if (attr !== undefined) (owned ??= new Set()).add(attr);
  }

  return owned;
}

/** Diffs the element's attributes against the serialized form of `props`, like SSR/`elementFor` write them. */
function syncAttrs(el: Element, props: Record<string, unknown>): void {
  const desired = new Map<string, string>();
  const owned = boundAttrs(props);

  attrEntries(props).forEach(([name, value]) => {
    if (value === false || value === null || value === undefined) return;
    desired.set(name, value === true ? '' : String(value));
  });
  keepRuntimeClasses(el, () => {
    el.getAttributeNames()
      .filter((name) => !desired.has(name) && owned?.has(name) !== true)
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
  bindProps(el, node.$p);
  if (typeof node.$p.dangerHTML === 'string') {
    if (el.innerHTML !== node.$p.dangerHTML) el.innerHTML = node.$p.dangerHTML;
  } else {
    const text = primitiveText(node.$p.children);

    if (text === null || !syncTextChild(el, text)) {
      reconcileChildren(el, node.$p.children, pass, svgChildren(node, svg));
    }
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
  bindProps(el, node.$p);
  const text = primitiveText(node.$p.children);

  if (typeof node.$p.dangerHTML === 'string') el.innerHTML = node.$p.dangerHTML;
  else if (text !== null) el.textContent = text;
  else reconcileChildren(el, node.$p.children, pass, svgChildren(node, svg));
  // `elementShell` writes `value` as an ATTRIBUTE, which selects nothing on a
  // fresh <select> (and is only a default for <textarea>) — the property write
  // must run once the options/children exist.
  if (VALUE_CONTROL_TAGS.has(node.$t as string)) syncControl(el, node.$p);

  return el;
}

/** `{row.label}` / `{row.id}` — the overwhelmingly common child shape. */
function primitiveText(children: unknown): string | null {
  if (typeof children === 'string') return children === '' ? null : children;

  return typeof children === 'number' ? String(children) : null;
}

/** Retargets a lone text child in place; false when the element's shape is anything else. */
function syncTextChild(el: Element, text: string): boolean {
  const first = el.firstChild;

  if (first === null || first.nextSibling !== null || first.nodeType !== Node.TEXT_NODE) return false;
  if (first.textContent !== text) first.textContent = text;

  return true;
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
    if (typeof slot === 'string' || isFor(slot.$t)) return;
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
  /** The container this list fills — the handle the detached-list sweep checks. */
  root: Element;
  rows: Map<unknown, RowScope>;
  stamp: number;
  /** The newest `<For>` node — its props, read non-reactively by the list effect. */
  node: JanuxNode;
  svg: boolean;
  /**
   * Set when `each` is a thunk: the list then owns a LIST-LEVEL effect and the
   * enclosing view never subscribes to the array at all. A write to the list
   * re-runs the key diff, not the page around it.
   */
  stop: (() => void) | null;
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
 * Every list under one island root, so a list whose CONTAINER disappears still
 * gets torn down. `<ul>{todos.length > 0 && <For/>}</ul>` drops the whole
 * container when the list empties: the WeakMap entry goes with the element, but
 * the row effects are subscribed to island state and would keep re-rendering
 * into detached nodes forever. Emptying and refilling a list leaked one live
 * effect per row per cycle, which is what made repeated editing degrade ~30x.
 */
const listsByIsland = new WeakMap<Element, Set<ForState>>();
/** The island root of the render in progress — the owner a new list registers under. */
let renderRoot: Element | null = null;

function disposeList(state: ForState): void {
  state.stop?.();
  state.stop = null;
  state.rows.forEach((row) => row.dispose());
  state.rows.clear();
}

function sweepDetachedLists(root: Element): void {
  const lists = listsByIsland.get(root);

  if (lists === undefined) return;
  lists.forEach((state) => {
    if (state.root === root || root.contains(state.root)) return;
    disposeList(state);
    lists.delete(state);
  });
}

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
    root,
    rows: new Map(),
    stamp: 0,
    node: null as unknown as JanuxNode,
    svg: false,
    stop: null,
    pass: { parent, seq: new Map(), used: new Set(), islands: [], foreigns: [] },
  };

  byId.set(id, created);
  if (renderRoot !== null) {
    const lists = listsByIsland.get(renderRoot) ?? new Set<ForState>();

    listsByIsland.set(renderRoot, lists);
    lists.add(created);
  }
  // The island scope owns the list: disposing it must stop every row effect.
  onCleanup(() => disposeList(created));

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
    // Rows get plain data even when the list itself was built outside state (a
    // `.filter()` over the proxy yields an array of proxies): otherwise a row
    // would subscribe to its INDEX path and every permutation would dirty it.
    const item = toRaw(items[index]);
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

  state.node = node;
  state.svg = svg;
  // `each={() => state.rows}` hands the list its own effect: the enclosing view
  // stops subscribing to the array, so a list write re-runs the key diff and
  // nothing else on the page. Already owned ⇒ the effect keeps it current.
  if (state.stop !== null) return;
  if (typeof node.$p.each === 'function') {
    let stop = () => {};

    stop = watch(() => forPass(state), scheduleRender);
    state.stop = stop;
    onCleanup(stop);

    return;
  }
  forPass(state);
}

function forPass(state: ForState): void {
  const root = state.root;
  const stamp = (state.stamp += 1);
  const node = state.node;
  const svg = state.svg;
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
  // A freshly created element has nothing to match against and nothing to
  // reorder — building a 1,000-row table is almost entirely this path. A list
  // sharing the container with siblings still needs the general path, which is
  // what places its rows among them.
  if (root.firstChild === null && !slots.some(isForSlot)) return appendSlots(root, slots, pass, svg);
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

/** Straight-line creation into an empty container. */
function appendSlots(root: Element, slots: Slot[], pass: RenderPass, svg: boolean): void {
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;

    if (typeof slot === 'string') root.appendChild(document.createTextNode(slot));
    else if (isBoundarySlot(slot)) root.appendChild(boundaryTarget(slot, null, pass, svg));
    else root.appendChild(createElementSlot(slot, pass, svg));
  }
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
  const previous = renderRoot;

  renderRoot = root;
  try {
    reconcileChildren(root, children, pass);
  } finally {
    renderRoot = previous;
  }
  sweepDetachedLists(root);
}
