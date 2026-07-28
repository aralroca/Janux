import { Fragment, type JanuxNode } from '../jsx-runtime';
import { attrEntries } from '../render/html';
import { isForeignDef } from '../interop';
import { isComponentDef, toDomNodes, type RenderPass } from './dom';
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
  if (typeof jsxNode.$t === 'function') return normalize((jsxNode.$t as any)(jsxNode.$p), out);
  out.push(jsxNode);

  return out;
}

function isBoundarySlot(slot: Slot): boolean {
  return typeof slot !== 'string' && (isComponentDef(slot.$t) || isForeignDef(slot.$t));
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
    const tag = node.$t as string;
    const inSvg = svg || tag === 'svg';

    reconcileChildren(el, node.$p.children, pass, inSvg && tag !== 'foreignObject');
  }
  // AFTER the children: `<select>.value` can only select an <option> that
  // already exists — written first, a value+options change in one pass left
  // the old selection in place.
  if (VALUE_CONTROL_TAGS.has(node.$t as string)) syncControl(el, node.$p);
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
  const created = toDomNodes(slot, pass, svg)[0]!;

  if (created.nodeType === Node.ELEMENT_NODE) {
    prevJsx.set(created as Element, slot);
    // `elementFor` writes `value` as an ATTRIBUTE, which selects nothing on a
    // fresh <select> (and is only a default for <textarea>) — the property
    // write must run once the options/children exist.
    if (VALUE_CONTROL_TAGS.has(slot.$t as string)) syncControl(created as Element, slot.$p);
  }

  return created;
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
    if (typeof slot !== 'string' && slot.$k !== undefined) (toKeys ??= new Set()).add(slot.$k);
  });

  return { fromKids, byKey, toKeys, hosts };
}

function reconcileChildren(root: Element, children: unknown, pass: RenderPass, svg = false): void {
  const slots = normalize(children, []);
  const match = matchState(root, slots);
  const targets = slots.map((slot, index) => {
    if (typeof slot === 'string') return textTarget(slot, match, index);
    if (isBoundarySlot(slot)) return boundaryTarget(slot, match.hosts, pass, svg);

    return elementTarget(slot, match, index, pass, svg);
  });

  orderChildren(root, targets, match.fromKids, match.byKey !== null || match.toKeys !== null);
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
