import type { AttrRow } from './attributes.cases';

/**
 * Edges of the executable-URL guard that `security/urls.cases.ts` does not
 * reach: its matrix crosses lowercase attribute names with payload spellings,
 * so what is pinned here is everything *around* that matrix — name casing,
 * non-string values, non-URL attributes, and the payloads that are safe
 * precisely because escaping (not blocking) neutralizes them.
 */
export const URL_EDGE_CASES: AttrRow[] = [
  // ── the attribute name is matched case-insensitively ────────────────────────
  { id: 'urledge-camelcase-formaction-is-still-blocked', src: 'janux', props: { formAction: 'javascript:alert(1)' }, expected: '' },
  { id: 'urledge-uppercase-href-is-still-blocked', src: 'janux', props: { HREF: 'javascript:alert(1)' }, expected: '' },
  { id: 'urledge-capitalized-src-is-still-blocked', src: 'janux', props: { Src: 'javascript:alert(1)' }, expected: '' },

  // ── only strings can carry a scheme ─────────────────────────────────────────
  { id: 'urledge-numeric-href-is-not-blocked', src: 'janux', props: { href: 123 }, expected: ' href="123"' },

  // ── non-URL attributes keep the payload, escaped like any value ─────────────
  { id: 'urledge-title-keeps-a-scheme-verbatim', src: 'react:UntrustedURL#non-url-attribute', props: { title: 'javascript:alert(1)' }, expected: ' title="javascript:alert(1)"' },
  { id: 'urledge-custom-data-attribute-keeps-a-scheme', src: 'janux', props: { 'data-href': 'javascript:alert(1)' }, expected: ' data-href="javascript:alert(1)"' },
  // srcset URLs load as images, never navigate — so the guard does not apply.
  { id: 'urledge-srcset-is-not-a-guarded-attribute', src: 'janux', props: { srcset: 'javascript:alert(1)' }, expected: ' srcset="javascript:alert(1)"' },

  // ── the colon is the boundary, the scheme must match exactly ────────────────
  { id: 'urledge-javascript-without-a-colon-is-allowed', src: 'janux', props: { href: 'javascript' }, expected: ' href="javascript"' },
  { id: 'urledge-longer-scheme-with-the-same-prefix-is-allowed', src: 'janux', props: { href: 'javascriptx:alert(1)' }, expected: ' href="javascriptx:alert(1)"' },
  // IE-only legacy scheme no modern browser executes: left alone on purpose.
  { id: 'urledge-jscript-scheme-is-not-blocked', src: 'janux', props: { href: 'jscript:alert(1)' }, expected: ' href="jscript:alert(1)"' },
  { id: 'urledge-uppercase-data-html-is-still-blocked', src: 'janux', props: { href: 'DATA:TEXT/HTML,<b>x</b>' }, expected: '' },

  // ── payloads neutralized by escaping rather than by blocking ────────────────
  // The browser decodes `&#x6A;` in an attribute — unless the `&` is escaped.
  { id: 'urledge-entity-encoded-scheme-is-defused-by-escaping', src: 'owasp:filter-evasion#entity-scheme', props: { href: '&#x6A;avascript:alert(1)' }, expected: ' href="&amp;#x6A;avascript:alert(1)"' },
  // A fullwidth `ｊ` is a different character; no URL parser folds it to `j`.
  { id: 'urledge-fullwidth-letter-is-not-the-scheme', src: 'owasp:filter-evasion#fullwidth', props: { href: 'ｊavascript:alert(1)' }, expected: ' href="ｊavascript:alert(1)"' },
  // URL parsing strips C0 controls and space — U+2028 is neither, so it stays.
  { id: 'urledge-leading-line-separator-is-not-stripped-by-browsers', src: 'janux', props: { href: ' javascript:alert(1)' }, expected: ' href=" javascript:alert(1)"' },
  { id: 'urledge-query-ampersand-is-escaped-in-a-safe-url', src: 'janux', props: { href: '/s?a=1&b=2' }, expected: ' href="/s?a=1&amp;b=2"' },

  // ── a blocked URL never takes its siblings with it ───────────────────────────
  { id: 'urledge-blocked-url-leaves-sibling-attributes-intact', src: 'janux', props: { id: 'x', href: 'javascript:alert(1)', class: 'c' }, expected: ' id="x" class="c"' },
];
