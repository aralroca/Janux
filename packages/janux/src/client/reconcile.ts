import { Fragment, type JanuxNode } from '../jsx-runtime';
import { attrEntries } from '../render/html';
import { isForeignDef } from '../interop';
import { toDomNodes, type RenderPass } from './dom';
import { ensureListenerForAttr } from './events';
import { nodeKey, setNodeKey } from './keys';

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

function isComponentDef(type: unknown): boolean {
  return typeof type === 'object' && type !== null && 'kind' in (type as any);
}

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

const BOUNDARY_TAGS = new Set(['JANUX-ISLAND', 'JANUX-FOREIGN']);

function isBoundaryHost(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE && BOUNDARY_TAGS.has((node as Element).tagName);
}

function isBoundarySlot(slot: Slot): boolean {
  return typeof slot !== 'string' && (isComponentDef(slot.$t) || isForeignDef(slot.$t));
}

/** The JSX node most recently reconciled into a live element — identical node ⇒ nothing to do. */
const prevJsx = new WeakMap<Element, JanuxNode>();

type ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isValueControl(el: Element): el is ValueControl {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  );
}

/** Controlled inputs: state → DOM property writes, never touching the focused control. */
function syncControl(el: Element, props: Record<string, unknown>): void {
  if (!isValueControl(el) || document.activeElement === el) return;
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const checked = props.checked === true;

    if (el.checked !== checked) el.checked = checked;

    return;
  }
  const value =
    props.value !== null && props.value !== undefined
      ? String(props.value)
      : el instanceof HTMLTextAreaElement && typeof props.children === 'string'
        ? props.children
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
  const runtimeClasses = [...el.classList].filter((name) => name.startsWith('janux-'));

  [...el.getAttributeNames()]
    .filter((name) => !desired.has(name))
    .forEach((name) => el.removeAttribute(name));
  desired.forEach((value, name) => {
    // A client render can bind an event the page had never used before this pass.
    ensureListenerForAttr(name);
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  });
  // `janux-*` classes belong to the runtime (e.g. the agent glow) — views
  // never render them, so re-renders must not wipe them.
  runtimeClasses.forEach((name) => el.classList.add(name));
}

/** Reconciles a reused element in place: attrs, control properties, children. */
function syncElement(el: Element, node: JanuxNode, pass: RenderPass, svg: boolean): void {
  if (prevJsx.get(el) === node) return;
  prevJsx.set(el, node);
  if (node.$k !== undefined) setNodeKey(el, node.$k);
  syncAttrs(el, node.$p);
  syncControl(el, node.$p);
  if (typeof node.$p.dangerHTML === 'string') {
    if (el.innerHTML !== node.$p.dangerHTML) el.innerHTML = node.$p.dangerHTML;

    return;
  }
  const tag = node.$t as string;
  const inSvg = svg || tag === 'svg';

  reconcileChildren(el, node.$p.children, pass, inSvg && tag !== 'foreignObject');
}

/** A boundary slot reuses a live host with the same id; the placeholder path assigns ids in pass order. */
function boundaryTarget(slot: JanuxNode, hosts: Map<string, Element>, pass: RenderPass, svg: boolean): Node {
  // `toDomNodes` runs the id/key bookkeeping (pass.seq/used + pending lists)
  // for islands and foreigns — identical for a reused host and a fresh one.
  const placeholder = toDomNodes(slot, pass, svg)[0] as Element;
  const host = hosts.get(placeholder.getAttribute('data-jx')!);

  if (!host) return placeholder;
  // The host's own runtime owns its interior; only the host attrs sync.
  [...placeholder.getAttributeNames()].forEach((name) => {
    if (host.getAttribute(name) !== placeholder.getAttribute(name)) {
      host.setAttribute(name, placeholder.getAttribute(name)!);
    }
  });

  return host;
}

function elementTarget(slot: JanuxNode, match: Match, index: number, pass: RenderPass, svg: boolean): Node {
  const key = slot.$k;
  const survivor = key === undefined ? undefined : match.byKey.get(key);

  if (survivor && (survivor as Element).tagName.toLowerCase() === (slot.$t as string).toLowerCase()) {
    syncElement(survivor as Element, slot, pass, svg);

    return survivor;
  }
  const fromKid = match.fromKids[index];
  const fromKey = fromKid === undefined ? undefined : nodeKey(fromKid);
  const claimedElsewhere = key === undefined ? fromKey !== undefined && match.toKeys.has(fromKey) : fromKey !== undefined;
  const reusable =
    fromKid !== undefined &&
    !claimedElsewhere &&
    !isBoundaryHost(fromKid) &&
    fromKid.nodeType === Node.ELEMENT_NODE &&
    (fromKid as Element).tagName.toLowerCase() === (slot.$t as string).toLowerCase();

  if (reusable) {
    syncElement(fromKid as Element, slot, pass, svg);

    return fromKid;
  }
  const created = toDomNodes(slot, pass, svg)[0]!;

  if (created.nodeType === Node.ELEMENT_NODE) prevJsx.set(created as Element, slot);

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
  byKey: Map<string | number, ChildNode>;
  toKeys: Set<string | number>;
}

function matchState(root: Element, slots: Slot[]): Match {
  const fromKids = [...root.childNodes];
  const keyed = fromKids.filter((kid) => !isBoundaryHost(kid) && nodeKey(kid) !== undefined);
  const slotKeys = slots
    .map((slot) => (typeof slot === 'string' ? undefined : slot.$k))
    .filter((key): key is string | number => key !== undefined);

  return {
    fromKids,
    byKey: new Map(keyed.map((kid) => [nodeKey(kid)!, kid])),
    toKeys: new Set(slotKeys),
  };
}

function reconcileChildren(root: Element, children: unknown, pass: RenderPass, svg = false): void {
  const slots = normalize(children, []);
  const match = matchState(root, slots);
  const hosts = new Map(
    match.fromKids
      .filter(isBoundaryHost)
      .map((host) => [host.getAttribute('data-jx')!, host] as const),
  );
  const targets = slots.map((slot, index) => {
    if (typeof slot === 'string') return textTarget(slot, match, index);
    if (isBoundarySlot(slot)) return boundaryTarget(slot, hosts, pass, svg);

    return elementTarget(slot, match, index, pass, svg);
  });

  targets.forEach((node, index) => {
    if (root.childNodes[index] !== node) root.insertBefore(node, root.childNodes[index] ?? null);
  });
  while (root.childNodes.length > targets.length) root.removeChild(root.lastChild!);
}

/** Patches `root`'s children in place to match the JSX `children` of an island view. */
export function reconcile(root: Element, children: unknown, pass: RenderPass): void {
  reconcileChildren(root, children, pass);
}
