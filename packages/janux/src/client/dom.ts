import { Fragment, type JanuxNode } from '../jsx-runtime';
import { attrEntries } from '../render/html';
import type { ComponentDef } from '../define/types';

function isComponentDef(type: unknown): type is ComponentDef {
  return typeof type === 'object' && type !== null && 'kind' in (type as any);
}

function setAttr(el: Element, name: string, value: unknown): void {
  if (value === false || value === null || value === undefined) return;

  el.setAttribute(name, value === true ? '' : String(value));
}

function appendChildren(el: Element, children: unknown): void {
  toDomNodes(children).forEach((node) => el.appendChild(node));
}

function elementFor(node: JanuxNode): Element {
  const el = document.createElement(node.$t as string);

  attrEntries(node.$p).forEach(([name, value]) => setAttr(el, name, value));
  if (typeof node.$p.dangerHTML === 'string') el.innerHTML = node.$p.dangerHTML;
  else appendChildren(el, node.$p.children);

  return el;
}

/** Expands a client view tree (static fns inline) into real DOM nodes. */
export function toDomNodes(node: unknown): Node[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    return [document.createTextNode(String(node))];
  }
  if (Array.isArray(node)) return node.flatMap(toDomNodes);
  const jsxNode = node as JanuxNode;

  if (jsxNode.$t === Fragment) return toDomNodes(jsxNode.$p.children);
  if (typeof jsxNode.$t === 'function') return toDomNodes((jsxNode.$t as any)(jsxNode.$p));
  if (isComponentDef(jsxNode.$t)) {
    throw new Error(
      `Janux: nested island <${jsxNode.$t.name}> inside another island is not supported yet`,
    );
  }

  return [elementFor(jsxNode)];
}
