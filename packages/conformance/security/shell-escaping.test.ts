import { describe, expect } from 'bun:test';
import { htmlDocument, type ShellOptions } from '@janux/server';
import { runCases } from '../support/scenario';
import { SHELL_ESCAPE_CASES, SHELL_MARKER, type ShellEscapeRow, type ShellField } from './shell-escaping.cases';

/**
 * Each row renders the shell twice — once with a benign value, once with the
 * payload — and asserts the payload changed nothing structural:
 *
 *  1. **No new tag.** The sequence of tag names is identical to the baseline's, so
 *     an escaped `<script>` is text and an unescaped one is a failure.
 *  2. **No new handler.** No `on…=` attribute appeared, which is the breakout a
 *     payload achieves without opening a tag at all (`" onxss="alert(1)`).
 *  3. **Still there.** The marker survives, so "sanitized" by deletion is a
 *     failure too — the shell's job is to encode, not to censor.
 *
 * Plus, per context, the thing that would actually end it: `</style` inside the
 * inline CSS, `</script` or a raw `<` inside a state script.
 */

const SAFE = `${SHELL_MARKER}-safe`;

/** A shell with the payload in exactly one field, everything else inert. */
function optionsFor(field: ShellField, value: string): ShellOptions {
  const base: ShellOptions = {
    html: '<p>x</p>',
    islandNames: ['c'],
    islandModules: { c: '/c.js' },
    snapshots: [{ uri: 'ui://c', state: { note: 'plain' } }],
  };

  if (field === 'title') return { ...base, title: value };
  if (field === 'description') return { ...base, description: value };
  if (field === 'favicon') return { ...base, favicon: value };
  if (field === 'stylesheet-href') return { ...base, stylesheets: [value] };
  if (field === 'font-preload-href') return { ...base, fontPreloads: [value] };
  if (field === 'snapshot-uri') return { ...base, snapshots: [{ uri: value, state: {} }] };
  if (field === 'i18n-locale') return { ...base, i18n: { locale: value, dir: 'ltr' } };
  if (field === 'lang') return { ...base, lang: value };
  if (field === 'runtime-url') return { ...base, runtimeUrl: value };
  if (field === 'manifest-url') return { ...base, manifestUrl: value };
  if (field === 'inline-style') return { ...base, inlineStyles: [value] };
  if (field === 'font-faces') return { ...base, fontFaces: value };
  if (field === 'snapshot-state') return { ...base, snapshots: [{ uri: 'ui://c', state: { note: value } }] };
  if (field === 'island-module') return { ...base, islandModules: { c: value } };

  return { ...base, i18n: { locale: 'en', dir: 'ltr', payload: { messages: { k: value } } } };
}

/**
 * The document's markup with every quoted attribute value and every
 * `<script>`/`<style>`/`<title>` body blanked out.
 *
 * Those three are text elements: `alert(1)` or `onxss=` *inside* one is data, not
 * a tag and not a handler. An attribute value is the same — ` onxss=` between two
 * quotes is text the browser never reads as an attribute. Blanking both is exact
 * rather than lenient: a value that really did break out contains a raw `"`, which
 * ends the blanking early and leaves the injection visible.
 *
 * Bodies go first — CSS text may legitimately carry a `"`, and blanking values
 * across one would eat the `</style>` after it — and the open tag is matched as
 * "quoted strings or non-`>`", because a `>` inside a quoted value does not end a
 * tag either.
 */
const TEXT_ELEMENT = /(<(script|style|title)(?:"[^"]*"|[^>])*>)[\s\S]*?(<\/\2>)/gi;

function skeleton(markup: string): string {
  return markup.replace(TEXT_ELEMENT, '$1$3').replace(/="[^"]*"/g, '=""');
}

/** Tag names in document order — the signature a breakout necessarily changes. */
function tags(markup: string): string[] {
  return [...skeleton(markup).matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((found) => found[1]!.toLowerCase());
}

/** `on…=` attributes, the breakout that needs no tag of its own. */
function handlers(markup: string): string[] {
  return [...skeleton(markup).matchAll(/\son[a-z]+\s*=/gi)].map((found) => found[0]!.trim());
}

/** The body of every `<style>` element. */
function styleBodies(markup: string): string[] {
  return [...markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((found) => found[1]!);
}

/** The body of every `<script>` element. */
function scriptBodies(markup: string): string[] {
  return [...markup.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((found) => found[1]!);
}

/** Inside a `<style>`, only `</style` ends the element — everything else is CSS text. */
function checkRawCss(document: string, baseline: string): void {
  const bodies = styleBodies(document);

  expect(bodies).toHaveLength(styleBodies(baseline).length);
  bodies.forEach((body) => expect(body).not.toMatch(/<\/style/i));
}

/** Inside a `<script>`, `</script` ends it and a raw `<` is how you get there. */
function checkScriptJson(document: string, baseline: string, payload: string): void {
  const bodies = scriptBodies(document);

  expect(bodies).toHaveLength(scriptBodies(baseline).length);
  bodies.forEach((body) => {
    expect(body).not.toMatch(/<\/script/i);
    expect(body).not.toContain('<');
  });
  // Lossless: the JSON still parses and still says exactly what it was given.
  const carried = bodies.filter((body) => body.includes(SHELL_MARKER)).map((body) => JSON.parse(body.replace(/^window\.__JANUX_ISLANDS__=/, '')));

  expect(carried.length).toBeGreaterThan(0);
  expect(JSON.stringify(carried)).toContain(JSON.stringify(payload).slice(1, -1));
}

describe('shell interpolation per escaper', () =>
  runCases(SHELL_ESCAPE_CASES, (row: ShellEscapeRow) => {
    const baseline = htmlDocument(optionsFor(row.field, SAFE));
    const document = htmlDocument(optionsFor(row.field, row.payload));

    expect(tags(document)).toEqual(tags(baseline));
    expect(handlers(document)).toEqual(handlers(baseline));
    expect(document).toContain(SHELL_MARKER);
    if (row.context === 'raw-css') checkRawCss(document, baseline);
    if (row.context === 'script-json') checkScriptJson(document, baseline, row.payload);
  }));
