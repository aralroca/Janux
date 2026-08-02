import { toRaw } from './state/reactive-state';

/**
 * `<For>` — the fine-grained list primitive.
 *
 * A plain `{list.map(…)}` is a single expression inside the island's one render
 * effect: touching ONE row re-runs the whole view (rebuilding every JSX node and
 * re-reading every reactive path) and reconciles the whole subtree. That cost is
 * a constant in the list length, which is why moving 1 row and moving 100 rows
 * used to cost the same.
 *
 * `<For>` gives every row its OWN reactive scope, in the spirit of Solid's
 * `<For>` and vue-vapor's compiled blocks. The list level only diffs keys and
 * moves nodes; each row's content re-renders only when that row's own item (or a
 * signal only that row reads) changes.
 *
 * ```tsx
 * <For each={state.rows} by={(row) => row.id}>
 *   {(row) => <li>{row.label}</li>}
 * </For>
 * ```
 *
 * Contract (the same one every identity-keyed list primitive has):
 *
 * - `by` identifies a row across renders. With Janux state, pass a stable field
 *   (`row.id`): a write to `state.rows` stores a defensive clone, so the array
 *   elements are new objects every time and their identity means nothing.
 *   It is spelled `by`, not `key`, because JSX reserves `key`: the transform
 *   lifts it out of the props object entirely, so a `key` prop would never
 *   reach this component.
 * - A row re-renders when its item is no longer deep-equal to the previous one.
 *   Rows receive PLAIN data, not the state proxy — a row's reactivity to its own
 *   item flows through this diff, and reactivity to anything else flows through
 *   the signals the row's body reads.
 * - The row body must produce exactly one node.
 * - `index` is an accessor, so rows that ignore their position (the common case)
 *   do not re-render when the list is permuted.
 *
 * On the server this is an ordinary function component that expands to the rows,
 * so SSR markup is identical to the `.map()` it replaces; the client reconciler
 * intercepts it before calling it and drives the fine-grained path instead.
 */
export interface ForProps<T> {
  /** The list, or a thunk returning it — read inside the enclosing render scope. */
  each: readonly T[] | (() => readonly T[]) | null | undefined;
  /** Row identity across renders — NOT `key`, which JSX reserves. Defaults to the item itself. */
  by?: (item: T, index: number) => string | number;
  children: (item: T, index: () => number) => unknown;
}

const FOR = Symbol.for('janux.for');
const EMPTY: readonly unknown[] = [];

/** The list as plain data: unwrapped from the state proxy, never re-read per row. */
export function readEach<T>(each: ForProps<T>['each']): readonly T[] {
  const list = typeof each === 'function' ? (each as () => readonly T[])() : each;

  if (list === null || list === undefined) return EMPTY as readonly T[];

  return toRaw(list);
}

export function For<T>(props: ForProps<T>): unknown {
  return readEach(props.each).map((item, index) => props.children(item, () => index));
}

(For as unknown as Record<symbol, boolean>)[FOR] = true;

export function isFor(type: unknown): boolean {
  return typeof type === 'function' && (type as unknown as Record<symbol, boolean>)[FOR] === true;
}
