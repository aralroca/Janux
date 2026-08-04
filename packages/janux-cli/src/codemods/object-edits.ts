import { spanOf, type SpanEdit } from './ast';

/**
 * Span edits over an object literal — the shape metadata migrations are made
 * of. Renaming a key, replacing a value and deleting a property are the three
 * moves; doing them by span is what leaves every other line of the literal, and
 * every comment in it, exactly as the author wrote it.
 */

/** The `key: value` entries of an `ObjectExpression`, ignoring spreads and methods. */
export function entries(object: any): any[] {
  return (object?.properties ?? []).filter((property: any) => property.type === 'KeyValueProperty');
}

/** A property's key as written, whether it was an identifier or a string. */
export function keyOf(property: any): string | undefined {
  const key = property.key;

  return key?.type === 'Identifier' || key?.type === 'StringLiteral' ? String(key.value) : undefined;
}

export function entryNamed(object: any, name: string): any | undefined {
  return entries(object).find((property) => keyOf(property) === name);
}

/** Rename a key in place, leaving its value untouched. */
export function renameKey(property: any, name: string, base: number): SpanEdit {
  return { ...spanOf(property.key, base), text: name };
}

/** Replace a property's value, leaving its key untouched. */
export function replaceValue(property: any, text: string, base: number): SpanEdit {
  return { ...spanOf(property.value, base), text };
}

/**
 * A property's own range. SWC gives a `KeyValueProperty` no span — the node
 * carries only its key and its value — so the entry is the ground it covers
 * between the two.
 */
function entrySpan(property: any, base: number): { start: number; end: number } {
  return { start: spanOf(property.key, base).start, end: spanOf(property.value, base).end };
}

/** How far past a property its own trailing comma reaches, if it wrote one. */
const TRAILING_COMMA = /^\s*,/;

function pastTrailingComma(code: string, end: number): number {
  const rest = Buffer.from(code, 'utf8').subarray(end).toString('utf8');
  const comma = TRAILING_COMMA.exec(rest);

  return end + (comma ? Buffer.byteLength(comma[0]) : 0);
}

/**
 * Delete a property, and the separator that would be left dangling with it.
 *
 * Which separator depends on where the property sits: everything up to the
 * *next* property goes when there is one, so its comma and the newline after it
 * leave together; otherwise the deletion starts at the end of the previous
 * property, taking the comma *before* it.
 *
 * The lone property is the case worth spelling out, because a formatter writes
 * a trailing comma on a multi-line object: removing only `a: 1` from
 * `{\n  a: 1,\n}` would leave `{\n  ,\n}`, which does not parse. So when
 * nothing follows and nothing precedes, the comma after it goes too.
 */
export function removeEntry(object: any, property: any, base: number, code: string): SpanEdit {
  const all = entries(object);
  const index = all.indexOf(property);
  const next = all[index + 1];
  const previous = all[index - 1];
  const span = entrySpan(property, base);

  if (next) return { start: span.start, end: entrySpan(next, base).start, text: '' };
  if (previous) return { start: entrySpan(previous, base).end, end: span.end, text: '' };

  return { start: span.start, end: pastTrailingComma(code, span.end), text: '' };
}
