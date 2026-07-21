/** Curated public-surface typings fed to Monaco via addExtraLib (IntelliSense in the playground). */
export const JANUX_DTS = `
declare module 'janux' {
  export interface JxType {
    optional(): JxType;
    nullable(): JxType;
    default(value: unknown): JxType;
    min(value: number): JxType;
    max(value: number): JxType;
  }
  /** String type. */
  export function str(): JxType;
  /** Integer type. */
  export function int(): JxType;
  export function num(): JxType;
  export function bool(): JxType;
  /** Monetary amount in minor units (cents). */
  export function money(): JxType;
  export function enums(values: readonly string[]): JxType;
  export function list(itemOrShape: JxType | Record<string, JxType>): JxType;
  export function obj(shape: Record<string, JxType>): JxType;
  /** Root schema for state and inputs. */
  export function schema(shape: Record<string, JxType>): JxType;

  export type Guard = 'auto' | 'confirm' | 'forbidden';

  export interface RunBag {
    state: any;
    derived: Record<string, any>;
    sources: Record<string, { value: any; pending: boolean; error: unknown; refresh(): Promise<void> }>;
    intents: Record<string, (input?: unknown) => Promise<unknown>>;
    use: Record<string, any>;
    emit: (event: string, payload: unknown) => void;
    ctx: Record<string, unknown>;
    input?: any;
    event?: any;
  }

  export interface IntentDef {
    description?: string;
    input?: JxType;
    /** auto (default) | confirm (human approves agent calls) | forbidden (human-only). */
    guard?: Guard | ((bag: { ctx: Record<string, unknown> }) => Guard);
    ready?: (bag: RunBag) => boolean;
    run: (bag: RunBag) => unknown;
  }

  /** Declares a named, schema-typed action — a tool for agents, a handler for clicks. */
  export function intent(def: IntentDef): IntentDef;
  export function effect(def: { description?: string; when?: (state: any) => unknown; debounce?: string; run: (bag: RunBag) => unknown }): any;
  export function source(def: { description?: string; query: (bag: { ctx: Record<string, unknown> }) => unknown; refresh?: any }): any;
  export function every(interval: string): any;
  export function onEvent(event: string): any;

  export interface ComponentDef {
    kind: 'component' | 'store';
    name: string;
  }

  /** One definition, three projections: view (humans), resource + tools (agents). */
  export function component(def: {
    name: string;
    description?: string;
    state?: JxType;
    derived?: Record<string, (state: any) => unknown>;
    sources?: Record<string, any>;
    effects?: Record<string, any>;
    intents?: Record<string, IntentDef>;
    emits?: Record<string, JxType>;
    on?: Record<string, (bag: RunBag) => void>;
    lifecycle?: { attach?: (bag: RunBag) => unknown; detach?: (bag: RunBag) => unknown };
    use?: Record<string, ComponentDef>;
    view: (bag: RunBag) => any;
  }): ComponentDef;

  /** A bifacial component without a view: shared state projected as store://name. */
  export function store(def: Record<string, unknown> & { name: string }): ComponentDef;
}

declare module 'janux/jsx-runtime' {
  export const Fragment: unique symbol;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  namespace JSX {
    type Element = any;
    interface IntrinsicElements { [element: string]: any }
  }
}
`;
