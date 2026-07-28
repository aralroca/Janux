import { nodeKey, setNodeKey } from './keys';

function syncAttrs(from: Element, to: Element): void {
  const runtimeClasses = [...from.classList].filter((name) => name.startsWith('janux-'));

  [...from.getAttributeNames()]
    .filter((name) => !to.hasAttribute(name))
    .forEach((name) => from.removeAttribute(name));
  to.getAttributeNames().forEach((name) => {
    if (from.getAttribute(name) !== to.getAttribute(name)) {
      from.setAttribute(name, to.getAttribute(name)!);
    }
  });
  // `janux-*` classes belong to the runtime (e.g. the agent glow) — views
  // never render them, so re-renders must not wipe them.
  runtimeClasses.forEach((name) => from.classList.add(name));
}

type ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isValueControl(el: Element): el is ValueControl {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  );
}

/** Controlled inputs: state → DOM property writes, never touching the focused control. */
function syncValue(from: Element, to: Element): void {
  if (!isValueControl(from) || !isValueControl(to) || document.activeElement === from) return;
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
    if (from.type === 'checkbox' || from.type === 'radio') {
      if (from.checked !== to.checked) from.checked = to.checked;

      return;
    }
  }
  if (from.value !== to.value) from.value = to.value;
}

const BOUNDARY_TAGS = new Set(['JANUX-ISLAND', 'JANUX-FOREIGN']);

/** Islands and foreign roots are opaque: their own runtime owns everything inside. */
function isIsland(node: Node): boolean {
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

    if (!host) return toKid;
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
  const claimedElsewhere = key === undefined ? fromKey !== undefined && match.toKeys.has(fromKey) : fromKey !== undefined;

  if (fromKid && !isIsland(fromKid) && !claimedElsewhere && sameKind(fromKid, toKid)) {
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
  syncValue(from as Element, to as Element);
  morphChildren(from as Element, to as Element);
}

/** Patches `root`'s children in place to match `nextChildren` (index+tag matching). */
export function morph(root: Element, nextChildren: Node[]): void {
  const target = document.createElement(root.tagName);

  nextChildren.forEach((child) => target.appendChild(child));
  morphChildren(root, target);
}
