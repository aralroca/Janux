import type { JxType } from '../schema';

/**
 * Which parts of a schema-typed value are fed by input the app did not author.
 *
 * State is schema-typed plain data (design invariant 2), so the declaration
 * that answers this already exists — `str().untrusted()`. Everything
 * downstream reads provenance off the schema rather than guessing at the
 * value, which is what keeps the marking exact and the flow unchanged.
 */

function walk(type: JxType, path: string, found: string[]): void {
  if (type.flags.untrusted) found.push(path);
  if (type.item) walk(type.item, `${path}[]`, found);
  Object.entries(type.shape ?? {}).forEach(([key, field]) =>
    walk(field, path ? `${path}.${key}` : key, found),
  );
}

/** Every path a value's untrusted content can appear at, in declaration order. */
export function untrustedFields(type: JxType | undefined): string[] {
  const found: string[] = [];

  if (type) walk(type, '', found);

  return found;
}

/** Whether anything in this schema is untrusted — the question a projection asks. */
export function hasUntrusted(type: JxType | undefined): boolean {
  return untrustedFields(type).length > 0;
}
