import type { Case } from '../support/case';

/**
 * Every value the HTML *shell* interpolates, against every way out of its context.
 *
 * `escaping.cases.ts` covers what the renderer does with a component's props. This
 * file covers the other half of the document: the shell around it — title,
 * description, link hrefs, inline CSS, the state scripts, the island module map.
 * Those go through three different escapers (`safeAttr`, the `</style` neutering,
 * `safeJson`), none of which the renderer's `escapeHtml` is involved in, so a fix
 * on one side proves nothing about the other.
 *
 * The fields are not interchangeable and that is the point: a page's `title` comes
 * from a route that may render user content, `snapshots[].state` is whatever an
 * island holds, an `islandModules` entry is a build-time path, and `manifestUrl`
 * is assembled from the request's own pathname. A shell that escapes ten of them
 * and forgets the eleventh has a hole in exactly one page shape.
 *
 * Asserted as invariants against a benign baseline render rather than as literals:
 * the payload may not add a tag, may not add an event-handler attribute, may not
 * close the `<style>` or `<script>` it landed in — and must still be *there*, so a
 * shell that "sanitizes" by dropping the value fails too.
 *
 * Payloads follow `owasp:filter-evasion` and the shell's own three escapers.
 */

/** Where in the shell the payload is interpolated. */
export type ShellField =
  | 'title'
  | 'description'
  | 'favicon'
  | 'stylesheet-href'
  | 'font-preload-href'
  | 'snapshot-uri'
  | 'i18n-locale'
  | 'lang'
  | 'runtime-url'
  | 'manifest-url'
  | 'inline-style'
  | 'font-faces'
  | 'snapshot-state'
  | 'island-module'
  | 'i18n-payload';

/** Which escaper the field goes through, and therefore what "cannot break out" means. */
export type ShellContext = 'attribute' | 'raw-css' | 'script-json';

export interface ShellEscapeCase {
  field: ShellField;
  context: ShellContext;
  payload: string;
}

export type ShellEscapeRow = Case<ShellEscapeCase>;

/** Present in every payload, so "the value survived" is assertable without knowing the encoding. */
export const SHELL_MARKER = 'jxmarker';

/** Each payload is a distinct way out of a context, not a spelling of the same one. */
const PAYLOADS: [string, string][] = [
  ['attribute-quote-breakout', `${SHELL_MARKER}" onxss="alert(1)`],
  ['tag-breakout', `${SHELL_MARKER}"><script>alert(1)</script>`],
  ['style-close', `${SHELL_MARKER}{}</style><script>alert(1)</script>`],
  ['script-close', `${SHELL_MARKER}</script><script>alert(1)</script>`],
  ['comment-breakout', `${SHELL_MARKER}--><script>alert(1)</script><!--`],
];

/** Every interpolated field, with the escaper it is supposed to reach. */
const FIELDS: [ShellField, ShellContext][] = [
  ['title', 'attribute'],
  ['description', 'attribute'],
  ['favicon', 'attribute'],
  ['stylesheet-href', 'attribute'],
  ['font-preload-href', 'attribute'],
  ['snapshot-uri', 'attribute'],
  ['i18n-locale', 'attribute'],
  ['lang', 'attribute'],
  ['runtime-url', 'attribute'],
  ['manifest-url', 'attribute'],
  ['inline-style', 'raw-css'],
  ['font-faces', 'raw-css'],
  ['snapshot-state', 'script-json'],
  ['island-module', 'script-json'],
  ['i18n-payload', 'script-json'],
];

export const SHELL_ESCAPE_CASES: ShellEscapeRow[] = FIELDS.flatMap(([field, context]) =>
  PAYLOADS.map(([label, payload]) => ({
    id: `sec2-shell-${field}-${label}`,
    src: 'owasp:filter-evasion',
    field,
    context,
    payload,
  })),
);
