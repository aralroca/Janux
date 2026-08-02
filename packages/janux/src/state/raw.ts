/**
 * Escape hatch to the plain object behind a state proxy.
 *
 * Two hot paths need it. `<For>` walks its list once per render to diff it, and
 * going through the proxy would register a tracked path (and build a child
 * proxy) for every index on every pass. `plainify` clones every value written
 * into state, and cloning through the traps costs one `childPath` + two map
 * lookups per property of a value it is only going to copy verbatim.
 *
 * It lives alone so both the proxy that produces it and the clone that consumes
 * it can import it without a cycle.
 */
export const RAW = Symbol.for('janux.raw');

/** The plain value behind a state proxy; anything else passes through. */
export function toRaw<T>(value: T): T {
  return (value as { [RAW]?: T } | null | undefined)?.[RAW] ?? value;
}
