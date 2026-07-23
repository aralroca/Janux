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

/**
 * Index+tag matching for regular nodes; islands match by id (`data-jx`) so a
 * live host survives position shifts — it is moved into place, never replaced
 * by its empty placeholder.
 */
function morphChildren(from: Element, to: Element): void {
  const islands = liveIslandHosts(from);
  const toKids = [...to.childNodes];

  toKids.forEach((toKid, index) => {
    const fromKid = from.childNodes[index];
    const live = isIsland(toKid) ? islands.get((toKid as Element).getAttribute('data-jx')!) : undefined;

    if (live && live !== fromKid) {
      from.insertBefore(live, fromKid ?? null);
      morphNode(live, toKid);

      return;
    }
    if (!fromKid) {
      from.appendChild(toKid);

      return;
    }
    if (!sameKind(fromKid, toKid)) {
      from.replaceChild(toKid, fromKid);

      return;
    }
    morphNode(fromKid, toKid);
  });
  while (from.childNodes.length > toKids.length) from.removeChild(from.lastChild!);
}

function morphNode(from: Node, to: Node): void {
  if (from.nodeType === Node.TEXT_NODE) {
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
