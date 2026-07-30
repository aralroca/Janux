/**
 * Foreign-UI interop (RFC 0002 §1): mount components from a foreign runtime
 * (React) unchanged, as opaque leaf islands driven by Janux state.
 *
 * The foreign subtree gets a real embedded root (100% behavioral fidelity),
 * renders server-side when the runtime is installed, and hydrates on a
 * client directive. It is opaque to agents by design — wrap it in a bifacial
 * shell whose intents drive its state to make it agent-legible (RFC §1.5).
 */

export type HydrateDirective = 'load' | 'idle' | 'visible' | 'only';

/** What a mapped `on:` entry receives: every callback argument, plus the JSX call-site props. */
export interface ForeignEvent {
  args: unknown[];
  own: Record<string, unknown>;
}

/**
 * An `on:` entry. The short form is an intent NAME and forwards the callback's
 * first argument. The mapped form adds `input`, for the many library callbacks
 * whose first argument is not the payload: an updater function
 * (`onSortingChange`), a live object graph (`onDragEnd`), or nothing at all
 * because the payload is the second argument (Recharts' `onClick`).
 */
export type ForeignBinding = string | { intent: string; input?: (event: ForeignEvent) => unknown };

export interface ForeignOptions {
  /** Island name used in ids/markup. Defaults to the component's name. */
  name?: string;
  /**
   * Maps the JSX call-site props (typically the shell's `state`, passed as
   * `<Foreign state={state} />`) to the foreign component's props. Tracked:
   * signal reads re-render only the foreign root.
   */
  props?: (own: Record<string, unknown>) => Record<string, unknown>;
  /** Maps a foreign callback prop to an intent on the enclosing island. */
  on?: Record<string, ForeignBinding>;
  /** When the client root mounts. `only` skips SSR entirely. Default: `load`. */
  hydrate?: HydrateDirective;
}

export interface ForeignDef {
  kind: 'foreign';
  name: string;
  component: unknown;
  options: Required<Pick<ForeignOptions, 'hydrate'>> & ForeignOptions;
}

/** TSX-callable phantom signature, mirroring `component()`. */
export type ForeignTag = ForeignDef & ((props?: Record<string, unknown>) => any);

function componentName(component: unknown): string {
  const named = component as { displayName?: string; name?: string };

  return named.displayName ?? named.name ?? 'foreign';
}

export function foreign(component: unknown, options: ForeignOptions = {}): ForeignTag {
  const def: ForeignDef = {
    kind: 'foreign',
    name: options.name ?? componentName(component),
    component,
    options: { hydrate: 'load', ...options },
  };

  return Object.freeze(def) as ForeignTag;
}

export function isForeignDef(type: unknown): type is ForeignDef {
  return typeof type === 'object' && type !== null && (type as ForeignDef).kind === 'foreign';
}
