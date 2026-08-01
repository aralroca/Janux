import { claimedElsewhere, nodeKey, setNodeKey } from './keys';

/**
 * Runs an attribute sync preserving runtime-owned `janux-*` classes (e.g. the
 * agent glow): views never render them, so re-renders must not wipe them. The
 * capture is lazy — the common no-runtime-class element allocates nothing.
 */
export function keepRuntimeClasses(el: Element, sync: () => void): void {
  let runtime: string[] | null = null;

  for (const name of el.classList) {
    if (name.startsWith('janux-')) (runtime ??= []).push(name);
  }
  sync();
  runtime?.forEach((name) => el.classList.add(name));
}

function syncAttrs(from: Element, to: Element): void {
  keepRuntimeClasses(from, () => {
    from
      .getAttributeNames()
      .filter((name) => !to.hasAttribute(name))
      .forEach((name) => from.removeAttribute(name));
    to.getAttributeNames().forEach((name) => {
      if (from.getAttribute(name) !== to.getAttribute(name)) {
        from.setAttribute(name, to.getAttribute(name)!);
      }
    });
  });
}

export type ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export const VALUE_CONTROL_TAGS = new Set(['input', 'textarea', 'select']);

export function isValueControl(el: Element): el is ValueControl {
  return VALUE_CONTROL_TAGS.has(el.localName);
}

interface ControlState {
  checked: boolean;
  value: string;
}

/**
 * The incoming control's state, captured BEFORE the child pass: `morphChildren`
 * moves incoming nodes into the live tree, so reading `to.value` afterwards can
 * see a `<select>` whose freshly-selected `<option>` is already gone.
 */
function captureControlState(to: Element): ControlState | null {
  if (!isValueControl(to)) return null;

  return { checked: (to as HTMLInputElement).checked === true, value: to.value };
}

/** Controlled inputs: state → DOM property writes, never touching the focused control. */
function syncValue(from: Element, state: ControlState | null): void {
  if (state === null || !isValueControl(from) || document.activeElement === from) return;
  if (from instanceof HTMLInputElement && (from.type === 'checkbox' || from.type === 'radio')) {
    if (from.checked !== state.checked) from.checked = state.checked;

    return;
  }
  if (from.value !== state.value) from.value = state.value;
}

const BOUNDARY_TAGS = new Set(['JANUX-ISLAND', 'JANUX-FOREIGN']);

/** Islands and foreign roots are opaque: their own runtime owns everything inside. */
export function isIsland(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE && BOUNDARY_TAGS.has((node as Element).tagName);
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  if ((a as Element).tagName !== (b as Element).tagName) return false;
  // Different islands never morph into each other — replace, so the old one sweeps.
  if (isIsland(a)) return (a as Element).getAttribute('data-jx') === (b as Element).getAttribute('data-jx');

  return true;
}

/** Live island hosts among `from`'s children, keyed by island id. */
function liveIslandHosts(from: Element): Map<string, Element> {
  const hosts = [...from.childNodes].filter(isIsland) as Element[];

  return new Map(hosts.map((host) => [host.getAttribute('data-jx')!, host]));
}

interface ChildMatch {
  fromKids: ChildNode[];
  islands: Map<string, Element>;
  /** Non-island keyed survivors among `from`'s children, by render key. */
  byKey: Map<string | number, ChildNode>;
  /** Keys the incoming children claim — an unkeyed child must not consume them. */
  toKeys: Set<string | number>;
}

/**
 * The node that should occupy position `index`: a live island host reused by id
 * (so it survives position shifts — never replaced by its empty placeholder), a
 * key-matched survivor moved into place, an index+tag-matched existing node
 * morphed in place, or the incoming node. A keyed incoming child with no keyed
 * match still adopts the unkeyed node at its position — that is how a resumed
 * SSR tree acquires keys on the first client render.
 */
function targetNode(match: ChildMatch, toKid: ChildNode, index: number): ChildNode {
  if (isIsland(toKid)) {
    const host = match.islands.get((toKid as Element).getAttribute('data-jx')!);

    // `sameKind`, not just the id: a `janux-island` and a `janux-foreign` can
    // share an id across a navigation, and handing the foreign's runtime a
    // host of the other kind breaks its mount — replace instead.
    if (!host || !sameKind(host, toKid)) return toKid;
    morphNode(host, toKid);

    return host;
  }
  const key = nodeKey(toKid);
  const survivor = key === undefined ? undefined : match.byKey.get(key);

  if (survivor && sameKind(survivor, toKid)) {
    morphNode(survivor, toKid);

    return survivor;
  }
  const fromKid = match.fromKids[index];
  const fromKey = fromKid === undefined ? undefined : nodeKey(fromKid);

  if (fromKid && !isIsland(fromKid) && !claimedElsewhere(key, fromKey, match.toKeys) && sameKind(fromKid, toKid)) {
    if (key !== undefined) setNodeKey(fromKid, key);
    morphNode(fromKid, toKid);

    return fromKid;
  }

  return toKid;
}

/**
 * Two-pass reconcile: first resolve the target node for each incoming child
 * (reusing live islands and key/index-matched nodes), then order `from`'s
 * children to that list. Snapshotting the incoming children first means the
 * mutation of `from` never desyncs the walk.
 */
function morphChildren(from: Element, to: Element): void {
  const fromKids = [...from.childNodes];
  const toKids = [...to.childNodes];
  const keyedFrom = fromKids.filter((kid) => !isIsland(kid) && nodeKey(kid) !== undefined);
  const match: ChildMatch = {
    fromKids,
    islands: liveIslandHosts(from),
    byKey: new Map(keyedFrom.map((kid) => [nodeKey(kid)!, kid])),
    toKeys: new Set(toKids.map(nodeKey).filter((key) => key !== undefined) as (string | number)[]),
  };
  const targets = toKids.map((toKid, index) => targetNode(match, toKid, index));

  targets.forEach((node, index) => {
    if (from.childNodes[index] !== node) from.insertBefore(node, from.childNodes[index] ?? null);
  });
  while (from.childNodes.length > targets.length) from.removeChild(from.lastChild!);
}

function morphNode(from: Node, to: Node): void {
  // Text *and* comments: `sameKind` reuses a comment node, so bailing out on it
  // left the old content in place — a comment whose text changed never updated.
  // Janux itself renders no comment markers, but `dangerHTML` and hand-written
  // SSR markup both carry them.
  if (from.nodeType === Node.TEXT_NODE || from.nodeType === Node.COMMENT_NODE) {
    if (from.textContent !== to.textContent) from.textContent = to.textContent;

    return;
  }
  if (from.nodeType !== Node.ELEMENT_NODE) return;
  syncAttrs(from as Element, to as Element);
  // A nested island is a boundary: its own render loop owns everything inside.
  if (isIsland(from)) return;
  // AFTER the children, exactly as in reconcile.ts: `<select>.value` can only
  // select an <option> that already exists — written first, a value+options
  // change in one pass left the old selection in place.
  const control = captureControlState(to as Element);

  morphChildren(from as Element, to as Element);
  syncValue(from as Element, control);
}

/** Patches `root`'s children in place to match `nextChildren` (index+tag matching). */
export function morph(root: Element, nextChildren: Node[]): void {
  const target = document.createElement(root.tagName);

  nextChildren.forEach((child) => target.appendChild(child));
  morphChildren(root, target);
}
