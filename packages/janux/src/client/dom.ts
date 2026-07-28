import { Fragment, type JanuxNode } from '../jsx-runtime';
import { attrEntries, dedupeKey, safeKey } from '../render/html';
import { isForeignDef, type ForeignDef } from '../interop';
import type { ComponentDef } from '../define/types';
import { ensureListenerForAttr } from './events';

/** A nested island found while expanding a parent view; mount.ts resolves it after the morph. */
export interface PendingIsland {
  id: string;
  def: ComponentDef;
  initial?: Record<string, unknown>;
}

/** A foreign (React) leaf found while expanding a parent view. */
export interface PendingForeign {
  id: string;
  def: ForeignDef;
  props: Record<string, unknown>;
}

/** Per-render-pass context: parent identity + per-def sequence, mirroring the SSR key scheme. */
export interface RenderPass {
  parent: { name: string; key: string };
  seq: Map<string, number>;
  used: Set<string>;
  islands: PendingIsland[];
  foreigns: PendingForeign[];
}

function isComponentDef(type: unknown): type is ComponentDef {
  return typeof type === 'object' && type !== null && 'kind' in (type as any);
}

function setAttr(el: Element, name: string, value: unknown): void {
  if (value === false || value === null || value === undefined) return;
  // A client render can bind an event the page had never used before this pass.
  ensureListenerForAttr(name);

  el.setAttribute(name, value === true ? '' : String(value));
}

function appendChildren(el: Element, children: unknown, pass?: RenderPass, svg?: boolean): void {
  toDomNodes(children, pass, svg).forEach((node) => el.appendChild(node));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG needs its namespace. `createElement('path')` yields an unknown HTML
 * element that lays out as nothing, so an icon rendered client-side (a view
 * that appeared after boot, not from SSR) was silently invisible while the
 * markup looked right in devtools.
 *
 * `foreignObject` is the door back to HTML, so its children stop inheriting it.
 */
function createElement(tag: string, svg: boolean): Element {
  return svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
}

function elementFor(node: JanuxNode, pass?: RenderPass, svg?: boolean): Element {
  const tag = node.$t as string;
  const inSvg = svg || tag === 'svg';
  const el = createElement(tag, inSvg);

  attrEntries(node.$p).forEach(([name, value]) => setAttr(el, name, value));
  if (typeof node.$p.dangerHTML === 'string') el.innerHTML = node.$p.dangerHTML;
  else appendChildren(el, node.$p.children, pass, inSvg && tag !== 'foreignObject');

  return el;
}

/** Same scheme as SSR `nextKey` for nested islands: `Parent.parentKey.(explicit|seq)`. */
function islandKey(pass: RenderPass, def: ComponentDef, explicit: unknown): string {
  const prefix = `${pass.parent.name}.${pass.parent.key}.`;

  if (explicit) return dedupeKey(`${prefix}${safeKey(explicit)}`, pass.used);
  const seq = (pass.seq.get(def.name) ?? 0) + 1;

  pass.seq.set(def.name, seq);

  return `${prefix}${seq}`;
}

/** A nested island renders as an empty host; its own render loop owns the content. */
function islandPlaceholder(node: JanuxNode, def: ComponentDef, pass: RenderPass): Element {
  const key = islandKey(pass, def, node.$k ?? node.$p.id);
  const id = `${def.name}#${key}`;
  const el = document.createElement('janux-island');

  el.setAttribute('data-jx', id);
  if (node.$p.persist) el.setAttribute('data-jx-persist', '');
  if (node.$p.eager) el.setAttribute('data-jx-eager', '');
  pass.islands.push({ id, def, initial: node.$p.initial as Record<string, unknown> | undefined });

  return el;
}

/** A foreign leaf renders as an empty host; its React root owns the content. */
function foreignPlaceholder(node: JanuxNode, def: ForeignDef, pass: RenderPass): Element {
  const key = islandKey(pass, def as unknown as ComponentDef, node.$k ?? node.$p.id);
  const id = `${def.name}#${key}`;
  const el = document.createElement('janux-foreign');
  const { children: _children, ...props } = node.$p;

  el.setAttribute('data-jx', id);
  el.setAttribute('data-jxf-hydrate', def.options.hydrate);
  pass.foreigns.push({ id, def, props });

  return el;
}

/** Expands a client view tree (static fns inline, nested islands as hosts) into real DOM nodes. */
export function toDomNodes(node: unknown, pass?: RenderPass, svg?: boolean): Node[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    return [document.createTextNode(String(node))];
  }
  if (Array.isArray(node)) return node.flatMap((child) => toDomNodes(child, pass, svg));
  const jsxNode = node as JanuxNode;

  if (jsxNode.$t === Fragment) return toDomNodes(jsxNode.$p.children, pass, svg);
  if (isForeignDef(jsxNode.$t)) {
    if (!pass) throw new Error(`Janux: foreign <${jsxNode.$t.name}> outside an island render pass`);

    return [foreignPlaceholder(jsxNode, jsxNode.$t, pass)];
  }
  if (typeof jsxNode.$t === 'function') return toDomNodes((jsxNode.$t as any)(jsxNode.$p), pass, svg);
  if (isComponentDef(jsxNode.$t)) {
    if (!pass) {
      throw new Error(`Janux: nested island <${jsxNode.$t.name}> outside an island render pass`);
    }

    return [islandPlaceholder(jsxNode, jsxNode.$t, pass)];
  }

  return [elementFor(jsxNode, pass, svg)];
}
