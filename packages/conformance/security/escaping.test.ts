import { describe, expect } from 'bun:test';
import { htmlDocument } from '@janux/server';
import { jsx, renderToString } from 'janux';
import { runCases } from '../support/scenario';
import { ESCAPE_CASES, type EscapeRow } from './escaping.cases';

/**
 * Two invariants per row, both stronger than any literal expectation.
 *
 *  1. **Cannot break out** — the interpolated region contains no raw character
 *     able to terminate its context (`<`/`>` in text, `"` in an attribute).
 *  2. **Lossless** — un-escaping the region reproduces the payload byte for byte.
 *
 * Together they rule out both halves of a bad escaper: one that lets a payload
 * escape, and one that "sanitizes" by mangling or dropping content. A per-row
 * expected string would catch neither reliably, because the same payload has a
 * different correct encoding in each position.
 */

/** Renders the payload into one position and returns just the region it landed in. */
async function regionFor(row: EscapeRow): Promise<string> {
  const { position, payload } = row;

  if (position === 'text') {
    const { html } = await renderToString(jsx('p', { children: payload }));

    return html.slice('<p>'.length, -'</p>'.length);
  }
  if (position === 'attribute') return attrValue((await renderToString(jsx('p', { title: payload, children: 'x' }))).html, 'title');
  if (position === 'class') return attrValue((await renderToString(jsx('p', { className: payload, children: 'x' }))).html, 'class');
  // The style attribute is `<property>:<value>`; each case owns one half of it.
  if (position === 'style-value') {
    const declaration = attrValue((await renderToString(jsx('p', { style: { color: payload }, children: 'x' }))).html, 'style');

    return declaration.slice('color:'.length);
  }
  if (position === 'style-property') {
    const declaration = attrValue((await renderToString(jsx('p', { style: { [payload]: 'red' }, children: 'x' }))).html, 'style');

    return declaration.slice(0, -':red'.length);
  }

  return snapshotJson(
    htmlDocument({
      html: '<p>x</p>',
      islandNames: ['c'],
      islandModules: { c: '/c.js' },
      snapshots: [{ uri: 'ui://c', state: { note: payload } }],
    }),
  );
}

/** The raw text between the quotes of `name="…"`. */
function attrValue(markup: string, name: string): string {
  const found = new RegExp(`${name}="([^"]*)"`).exec(markup);

  return found?.[1] ?? '';
}

/** The body of the state `<script>` block. */
function snapshotJson(markup: string): string {
  const found = /<script type="application\/janux\+state"[^>]*>([\s\S]*?)<\/script>/.exec(markup);

  return found?.[1] ?? '';
}

const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&amp;/g, '&'],
];

/** `&amp;` last, so an escaped entity is not unescaped twice. */
function unescape(text: string): string {
  return ENTITIES.reduce((current, [pattern, char]) => current.replace(pattern, char), text);
}

/** Characters that would terminate each context if they survived raw. */
const FORBIDDEN: Record<EscapeRow['position'], RegExp> = {
  text: /[<>]/,
  attribute: /["<>]/,
  class: /["<>]/,
  'style-value': /["<>]/,
  'style-property': /["<>]/,
  snapshot: /</,
};

/** `style-property` runs through camelCase→kebab conversion, so it is lossy by design. */
const LOSSY: EscapeRow['position'][] = ['style-property'];

describe('escaping per render position', () =>
  runCases(ESCAPE_CASES, async (row) => {
    const region = await regionFor(row);

    expect(region).not.toMatch(FORBIDDEN[row.position]);
    if (LOSSY.includes(row.position)) return;
    if (row.position === 'snapshot') {
      expect(JSON.parse(region).state.note).toBe(row.payload);

      return;
    }
    expect(unescape(region)).toBe(row.payload);
  }));
