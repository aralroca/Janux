import type { Case } from '../support/case';

/**
 * The file-system conventions themselves: which files become routes, what the
 * URL for each looks like, how `(group)` directories and `_layout` chains
 * compose, and where `_404`/`_500` are discovered. Cases follow
 * `next:file-conventions`, `astro:routing#file-based` and `fresh:routing`.
 *
 * The fixture tree in `__fixtures__/conventions`:
 *   _layout.tsx  _404.tsx  _500.tsx  _helpers.tsx  notes.md  styles.css
 *   index.tsx  page-ts.ts  page-js.js  page-jsx.jsx
 *   v1.2.tsx  data.json.tsx  UPPER.tsx  .hidden.tsx  mixed.dots.and-dashes.tsx  a[b]c.tsx
 *   (outer)/_layout.tsx  (outer)/inside.tsx  (outer)/(inner)/deep.tsx  (outer)/[gslug].tsx
 *   (v2.0)/versioned.tsx
 *   sub/_layout.tsx  sub/page.tsx  sub/nested/_layout.tsx  sub/nested/index.tsx
 *   dual/_layout.tsx  dual/_layout.js  dual/page.tsx
 *   .well-known/hello.tsx  [half/x.tsx  []/y.tsx
 */
export interface ConventionCase {
  path: string;
  pattern: string | null;
  /** Path of the serving file, relative to the fixture root; `null` for no match. */
  file: string | null;
}

export type ConventionRow = Case<ConventionCase>;

export const CONVENTION_CASES: ConventionRow[] = [
  // ── which extensions are pages ──────────────────────────────────────────────
  { id: 'conv-ts-file-is-routable', src: 'next:file-conventions#extensions', path: '/page-ts', pattern: '/page-ts', file: 'page-ts.ts' },
  { id: 'conv-js-file-is-routable', src: 'janux', path: '/page-js', pattern: '/page-js', file: 'page-js.js' },
  { id: 'conv-jsx-file-is-routable', src: 'janux', path: '/page-jsx', pattern: '/page-jsx', file: 'page-jsx.jsx' },
  { id: 'conv-markdown-is-not-a-page', src: 'janux', path: '/notes', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-css-is-not-a-page', src: 'janux', path: '/styles', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },

  // ── underscore files are infrastructure, never routes ───────────────────────
  { id: 'conv-underscore-files-are-never-routes', src: 'fresh:routing#underscore', path: '/_helpers', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-layout-file-is-not-a-route', src: 'janux', path: '/_layout', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-404-page-is-not-a-route', src: 'janux', path: '/_404', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-500-page-is-not-a-route', src: 'janux', path: '/_500', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },

  // ── index is a mapping, not a name ──────────────────────────────────────────
  { id: 'conv-root-index-file-serves-the-root', src: 'janux', path: '/', pattern: '/', file: 'index.tsx' },
  { id: 'conv-index-is-a-name-not-a-url', src: 'next:file-conventions#index', path: '/index', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-directory-index-serves-the-directory', src: 'janux', path: '/sub/nested', pattern: '/sub/nested', file: 'sub/nested/index.tsx' },
  { id: 'conv-directory-without-an-index-is-not-a-route', src: 'janux', path: '/sub', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-plain-file-in-a-directory', src: 'janux', path: '/sub/page', pattern: '/sub/page', file: 'sub/page.tsx' },

  // ── group directories organise without touching the URL ─────────────────────
  { id: 'conv-group-directory-is-invisible', src: 'next:file-conventions#route-groups', path: '/inside', pattern: '/inside', file: '(outer)/inside.tsx' },
  { id: 'conv-nested-groups-are-both-invisible', src: 'janux', path: '/deep', pattern: '/deep', file: '(outer)/(inner)/deep.tsx' },
  { id: 'conv-group-name-may-contain-dots', src: 'janux', path: '/versioned', pattern: '/versioned', file: '(v2.0)/versioned.tsx' },
  { id: 'conv-dynamic-file-inside-a-group-matches-at-the-root', src: 'janux', path: '/anything-here', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-group-segment-is-not-addressable', src: 'janux', path: '/(outer)/inside', pattern: null, file: null },

  // ── file names are taken literally, not as syntax ───────────────────────────
  { id: 'conv-dots-in-a-file-name-stay-in-the-route', src: 'janux', path: '/v1.2', pattern: '/v1.2', file: 'v1.2.tsx' },
  { id: 'conv-multi-extension-name-keeps-the-inner-extension', src: 'next:file-conventions#json-route', path: '/data.json', pattern: '/data.json', file: 'data.json.tsx' },
  { id: 'conv-a-dot-in-a-route-is-not-a-regex-dot', src: 'janux', path: '/v1x2', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-upper-case-file-is-served-verbatim', src: 'janux', path: '/UPPER', pattern: '/UPPER', file: 'UPPER.tsx' },
  { id: 'conv-lower-case-request-misses-the-upper-file', src: 'janux', path: '/upper', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-dotfile-page-is-routable', src: 'janux', path: '/.hidden', pattern: '/.hidden', file: '.hidden.tsx' },
  { id: 'conv-dot-directory-is-routable', src: 'janux', path: '/.well-known/hello', pattern: '/.well-known/hello', file: '.well-known/hello.tsx' },
  { id: 'conv-dots-and-dashes-mix-in-one-name', src: 'janux', path: '/mixed.dots.and-dashes', pattern: '/mixed.dots.and-dashes', file: 'mixed.dots.and-dashes.tsx' },
  { id: 'conv-brackets-inside-a-name-are-static-text', src: 'janux', path: '/a[b]c', pattern: '/a[b]c', file: 'a[b]c.tsx' },
  { id: 'conv-bracket-name-is-not-a-regex-class', src: 'janux', path: '/abc', pattern: '/[gslug]', file: '(outer)/[gslug].tsx' },
  { id: 'conv-half-open-bracket-directory-is-static', src: 'janux', path: '/[half/x', pattern: '/[half/x', file: '[half/x.tsx' },
  { id: 'conv-empty-brackets-directory-is-static', src: 'janux', path: '/[]/y', pattern: '/[]/y', file: '[]/y.tsx' },

  // ── groups compose with real directories on either side ─────────────────────
  { id: 'conv-real-directory-inside-a-group-keeps-its-segment', src: 'janux', path: '/realdir/thing', pattern: '/realdir/thing', file: '(outer)/realdir/thing.tsx' },
  { id: 'conv-group-inside-a-real-directory-stays-invisible', src: 'janux', path: '/sub/extra', pattern: '/sub/extra', file: 'sub/(grouped)/extra.tsx' },
];

/** Layout chains: outermost → innermost, as file paths relative to the root. */
export interface LayoutCase {
  path: string;
  layouts: string[];
}

export type LayoutRow = Case<LayoutCase>;

export const LAYOUT_CASES: LayoutRow[] = [
  { id: 'conv-lay-root-layout-wraps-the-index', src: 'janux', path: '/', layouts: ['_layout.tsx'] },
  { id: 'conv-lay-root-layout-wraps-a-plain-page', src: 'janux', path: '/page-ts', layouts: ['_layout.tsx'] },
  { id: 'conv-lay-group-layout-applies-without-a-url-segment', src: 'next:file-conventions#group-layout', path: '/inside', layouts: ['_layout.tsx', '(outer)/_layout.tsx'] },
  { id: 'conv-lay-inner-group-without-a-layout-adds-nothing', src: 'janux', path: '/deep', layouts: ['_layout.tsx', '(outer)/_layout.tsx'] },
  { id: 'conv-lay-directory-chain-composes-outermost-first', src: 'janux', path: '/sub/nested', layouts: ['_layout.tsx', 'sub/_layout.tsx', 'sub/nested/_layout.tsx'] },
  { id: 'conv-lay-sibling-file-gets-only-its-directory-chain', src: 'janux', path: '/sub/page', layouts: ['_layout.tsx', 'sub/_layout.tsx'] },
  { id: 'conv-lay-dynamic-route-inherits-its-group-layout', src: 'janux', path: '/whatever', layouts: ['_layout.tsx', '(outer)/_layout.tsx'] },
  { id: 'conv-lay-tsx-layout-beats-its-js-twin', src: 'janux', path: '/dual/page', layouts: ['_layout.tsx', 'dual/_layout.tsx'] },
  { id: 'conv-lay-real-directory-inside-a-group-inherits-the-group-chain', src: 'janux', path: '/realdir/thing', layouts: ['_layout.tsx', '(outer)/_layout.tsx'] },
  { id: 'conv-lay-group-inside-a-real-directory-inherits-the-directory-chain', src: 'janux', path: '/sub/extra', layouts: ['_layout.tsx', 'sub/_layout.tsx'] },
];

/** Where the error pages are discovered — and that their absence is `null`. */
export interface ErrorPageCase {
  kind: 'notFound' | 'serverError';
  fixture: 'conventions' | 'routes';
  file: string | null;
}

export type ErrorPageRow = Case<ErrorPageCase>;

export const ERROR_PAGE_CASES: ErrorPageRow[] = [
  { id: 'conv-err-404-page-is-discovered-at-the-root', src: 'janux', kind: 'notFound', fixture: 'conventions', file: '_404.tsx' },
  { id: 'conv-err-500-page-is-discovered-at-the-root', src: 'janux', kind: 'serverError', fixture: 'conventions', file: '_500.tsx' },
  { id: 'conv-err-404-is-optional', src: 'janux', kind: 'notFound', fixture: 'routes', file: null },
  { id: 'conv-err-500-is-optional', src: 'janux', kind: 'serverError', fixture: 'routes', file: null },
];
