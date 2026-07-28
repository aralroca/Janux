import type { ComponentDef } from './define/types';
import type { CSSProperties as JanuxCSSProperties } from './jsx-attributes';
import type { JanuxElementProps, JanuxHTMLElements, JanuxSVGElements } from './jsx-elements';

export type JanuxType = string | ((props: any) => unknown) | ComponentDef | symbol;

export interface JanuxNode {
  $t: JanuxType;
  $p: Record<string, unknown>;
  $k?: string | number;
}

export const Fragment = Symbol.for('janux.fragment');

export function jsx(type: JanuxType, props: Record<string, unknown> | null, key?: string | number): JanuxNode {
  return { $t: type, $p: props ?? {}, $k: key };
}

export const jsxs = jsx;

export function jsxDEV(
  type: JanuxType,
  props: Record<string, unknown> | null,
  key?: string | number,
): JanuxNode {
  return jsx(type, props, key);
}

export declare namespace JSX {
  type Element = JanuxNode;
  /** The typed shape of a `style={{…}}` object — see `CSSProperties` in `janux`. */
  type CSSProperties = JanuxCSSProperties;
  interface IntrinsicElements extends JanuxHTMLElements, JanuxSVGElements {
    /** A custom element accepts the global surface plus any attribute. */
    [customElement: `${string}-${string}`]: JanuxElementProps;
  }
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}
