function syncAttrs(from: Element, to: Element): void {
  [...from.getAttributeNames()]
    .filter((name) => !to.hasAttribute(name))
    .forEach((name) => from.removeAttribute(name));
  to.getAttributeNames().forEach((name) => {
    if (from.getAttribute(name) !== to.getAttribute(name)) {
      from.setAttribute(name, to.getAttribute(name)!);
    }
  });
}

function syncValue(from: Element, to: Element): void {
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
    if (from.value !== to.value && document.activeElement !== from) from.value = to.value;
  }
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;

  return (a as Element).tagName === (b as Element).tagName;
}

function morphChildren(from: Element, to: Element): void {
  const fromKids = [...from.childNodes];
  const toKids = [...to.childNodes];

  toKids.forEach((toKid, index) => {
    const fromKid = fromKids[index];

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
  fromKids.slice(toKids.length).forEach((extra) => from.removeChild(extra));
}

function morphNode(from: Node, to: Node): void {
  if (from.nodeType === Node.TEXT_NODE) {
    if (from.textContent !== to.textContent) from.textContent = to.textContent;

    return;
  }
  if (from.nodeType !== Node.ELEMENT_NODE) return;
  syncAttrs(from as Element, to as Element);
  syncValue(from as Element, to as Element);
  morphChildren(from as Element, to as Element);
}

/** Patches `root`'s children in place to match `nextChildren` (index+tag matching). */
export function morph(root: Element, nextChildren: Node[]): void {
  const target = document.createElement(root.tagName);

  nextChildren.forEach((child) => target.appendChild(child));
  morphChildren(root, target);
}
