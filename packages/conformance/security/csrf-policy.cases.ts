import type { Case } from '../support/case';

/**
 * The forgery decision itself, one posture per row.
 *
 * `csrf.cases.ts` drives whole endpoints through a real server, which is what
 * proves the guard is *reached*. This file drives `refuseCrossSite` directly,
 * which is what pins the decision it makes — the two are different claims and the
 * second is where the interesting cases live: a `Referer` that is only a path, an
 * allowlist entry written with a trailing slash, a `Sec-Fetch-Site` header
 * capitalised the way no browser writes it, a signature verifier that throws.
 *
 * Every ambiguous row resolves the same way: **refuse**. An origin the code cannot
 * parse, an allowlist entry that does not match after normalisation, a verifier
 * that fails to answer — none of them is evidence that the caller is who it says,
 * and treating "cannot tell" as "allow" is the whole bug class this file exists
 * for.
 *
 * Sources: MDN `Sec-Fetch-Site`, RFC 6454 §4 (origin serialisation), OWASP CSRF
 * Prevention Cheat Sheet.
 */
export interface CsrfPolicyCase {
  /** Pathname the request targets, verbatim — prefix matching is part of the claim. */
  path: string;
  method: string;
  headers: Record<string, string>;
  allowedOrigins?: string[];
  /** What Web Bot Auth verification does when it is consulted at all. */
  verify?: 'yes' | 'no' | 'throws';
  /**
   * `pass` ⇒ the request continues to the route; `forgery` ⇒ 403
   * `cross_site_denied`; `method` ⇒ 405 `method_not_allowed`.
   */
  expected: 'pass' | 'forgery' | 'method';
  /** True when the verifier must not even be asked. */
  verifierUnused?: boolean;
}

export type CsrfPolicyRow = Case<CsrfPolicyCase>;

const SELF = 'http://test';
const EVIL = 'https://evil.example';
const PARTNER = 'https://partner.example';

/** The guarded surface, and the neighbours that must stay unguarded. */
const PATHS: [string, string, CsrfPolicyCase['expected']][] = [
  ['api-subtree', '/_janux/api/shop.wire', 'forgery'],
  ['api-nested-name', '/_janux/api/a.b.c', 'forgery'],
  ['api-bare-prefix', '/_janux/api', 'pass'],
  ['api-lookalike-sibling', '/_janux/apix/shop.wire', 'pass'],
  ['approve', '/_janux/approve', 'forgery'],
  ['approve-lookalike', '/_janux/approveX', 'pass'],
  ['reject', '/_janux/reject', 'forgery'],
  ['agent', '/_janux/agent', 'forgery'],
  ['llm', '/_janux/llm', 'forgery'],
  ['mcp', '/_janux/mcp', 'pass'],
  ['manifest', '/_janux/manifest', 'pass'],
  ['runtime-asset', '/_janux/runtime.js', 'pass'],
  ['page', '/checkout', 'pass'],
  ['markdown-projection', '/docs/index.md', 'pass'],
];

const CROSS_SITE = { 'sec-fetch-site': 'cross-site', origin: EVIL };

/** Which paths the guard covers at all, with everything else held constant. */
const pathRows: CsrfPolicyRow[] = PATHS.map(([label, path, expected]) => ({
  id: `sec2-csrf-covers-${label}`,
  src: 'janux',
  path,
  method: 'POST',
  headers: CROSS_SITE,
  expected,
}));

/** Every verb on a guarded path: safe ones are refused as such, the rest as forgery. */
const METHODS: [string, string, CsrfPolicyCase['expected']][] = [
  // `POST` itself is not repeated here — the path matrix above already pins it on
  // every guarded path, including this one.
  ['put', 'PUT', 'forgery'],
  ['patch', 'PATCH', 'forgery'],
  ['delete', 'DELETE', 'forgery'],
  ['trace', 'TRACE', 'forgery'],
  // A spelling the runtime does not recognise never reaches the guard as itself:
  // `new Request` turns it into GET, so the exotic-verb bypass is refused as a
  // method error rather than sneaking past a verb denylist.
  ['an-unrecognised-spelling-arrives-as-get', 'WIRE', 'method'],
  ['lowercase-post', 'post', 'forgery'],
  ['get', 'GET', 'method'],
  ['head', 'HEAD', 'method'],
  ['options', 'OPTIONS', 'method'],
  ['lowercase-get', 'get', 'method'],
];

/**
 * Aimed at `/_janux/approve` rather than at an api path: it is matched exactly
 * instead of by prefix, so the verb matrix also proves the two matching styles
 * reach the same decision — and it keeps these rows distinct from the
 * path-coverage ones above, which already pin `POST` on the api subtree.
 */
const methodRows: CsrfPolicyRow[] = METHODS.map(([label, method, expected]) => ({
  id: `sec2-csrf-verb-${label}`,
  src: 'janux',
  path: '/_janux/approve',
  method,
  headers: CROSS_SITE,
  expected,
}));

/** What the request looks like when it arrives, and whether that is evidence. */
const POSTURES: [string, Record<string, string>, CsrfPolicyCase['expected']][] = [
  // Fetch metadata, which page JS cannot forge.
  ['fetch-metadata-same-origin', { 'sec-fetch-site': 'same-origin' }, 'pass'],
  ['fetch-metadata-none', { 'sec-fetch-site': 'none' }, 'pass'],
  ['fetch-metadata-same-site-alone', { 'sec-fetch-site': 'same-site' }, 'forgery'],
  ['fetch-metadata-same-site-with-own-origin', { 'sec-fetch-site': 'same-site', origin: SELF }, 'pass'],
  ['fetch-metadata-cross-site-with-own-origin', { 'sec-fetch-site': 'cross-site', origin: SELF }, 'pass'],
  // Spelled the way no browser spells it: the value is compared exactly, and a
  // near-miss falls through to the Origin check instead of being waved through.
  ['fetch-metadata-capitalised-none', { 'sec-fetch-site': 'None' }, 'forgery'],
  // Surrounding whitespace is not the app's problem: header values are trimmed
  // before any handler sees them, so this is the same header as the plain one.
  ['fetch-metadata-padded-same-origin', { 'sec-fetch-site': ' same-origin ' }, 'pass'],
  ['fetch-metadata-empty', { 'sec-fetch-site': '' }, 'forgery'],
  ['fetch-metadata-nonsense', { 'sec-fetch-site': 'banana' }, 'forgery'],

  // The Origin/Referer fallback.
  ['origin-own', { origin: SELF }, 'pass'],
  ['origin-with-a-path-still-compares-by-origin', { origin: `${SELF}/checkout` }, 'pass'],
  ['origin-other-port', { origin: 'http://test:8080' }, 'forgery'],
  ['origin-other-scheme', { origin: 'https://test' }, 'forgery'],
  ['origin-subdomain', { origin: 'http://sub.test' }, 'forgery'],
  ['origin-uppercase-host-normalises', { origin: 'HTTP://TEST' }, 'pass'],
  ['origin-trailing-slash-normalises', { origin: `${SELF}/` }, 'pass'],
  ['origin-null', { origin: 'null' }, 'forgery'],
  ['origin-empty', { origin: '' }, 'forgery'],
  ['origin-unparseable', { origin: 'not a url' }, 'forgery'],
  ['origin-relative', { origin: '/local' }, 'forgery'],
  ['referer-own', { referer: `${SELF}/checkout` }, 'pass'],
  ['referer-own-with-query-and-hash', { referer: `${SELF}/x?y=1#z` }, 'pass'],
  ['referer-cross-site', { referer: `${EVIL}/lure` }, 'forgery'],
  ['referer-path-only', { referer: '/local' }, 'forgery'],
  // `Origin` is checked first and is not overridable by a friendlier `Referer`.
  ['origin-evil-beats-a-friendly-referer', { origin: EVIL, referer: `${SELF}/x` }, 'forgery'],
  ['origin-own-with-a-hostile-referer', { origin: SELF, referer: `${EVIL}/x` }, 'pass'],
  // Absent evidence is the classic bypass: it is a refusal, not a pass.
  ['no-headers-at-all', {}, 'forgery'],
];

const postureRows: CsrfPolicyRow[] = POSTURES.map(([label, headers, expected]) => ({
  id: `sec2-csrf-posture-${label}`,
  src: 'mdn:sec-fetch-site',
  path: '/_janux/api/shop.wire',
  method: 'POST',
  headers,
  expected,
}));

export const CSRF_POLICY_CASES: CsrfPolicyRow[] = [
  ...pathRows,
  ...methodRows,
  ...postureRows,

  // ── the configurable allowlist ──────────────────────────────────────────────
  {
    id: 'sec2-csrf-allowlist-admits-an-exact-origin',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', origin: PARTNER },
    allowedOrigins: [PARTNER],
    expected: 'pass',
  },
  {
    id: 'sec2-csrf-allowlist-admits-the-referer-fallback-too',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { referer: `${PARTNER}/page` },
    allowedOrigins: [PARTNER],
    expected: 'pass',
  },
  {
    id: 'sec2-csrf-allowlist-admits-one-of-several-entries',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: PARTNER },
    allowedOrigins: ['https://a.example', PARTNER, 'https://b.example'],
    expected: 'pass',
  },
  {
    id: 'sec2-csrf-allowlist-normalises-the-caller-side-casing',
    src: 'rfc:6454#4',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: 'HTTPS://PARTNER.EXAMPLE' },
    allowedOrigins: [PARTNER],
    expected: 'pass',
  },
  {
    // Fail-closed on a misconfiguration: an entry that is not a serialised origin
    // never matches, so a typo costs availability rather than safety.
    id: 'sec2-csrf-allowlist-entry-with-a-trailing-slash-does-not-match',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: PARTNER },
    allowedOrigins: [`${PARTNER}/`],
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-allowlist-entry-with-a-path-does-not-match',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: PARTNER },
    allowedOrigins: [`${PARTNER}/webhooks`],
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-allowlist-entry-with-a-different-port-does-not-match',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: PARTNER },
    allowedOrigins: ['https://partner.example:8443'],
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-allowlist-has-no-wildcard',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: EVIL },
    allowedOrigins: ['*'],
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-allowlist-has-no-subdomain-wildcard',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: 'https://sub.partner.example' },
    allowedOrigins: ['https://*.partner.example'],
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-an-empty-allowlist-is-same-origin-only',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: PARTNER },
    allowedOrigins: [],
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-an-allowlist-does-not-loosen-the-null-origin',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { origin: 'null' },
    allowedOrigins: ['null'],
    expected: 'forgery',
  },

  // ── the Web Bot Auth exemption ──────────────────────────────────────────────
  {
    id: 'sec2-csrf-a-verified-signature-admits-a-cross-site-agent',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: CROSS_SITE,
    verify: 'yes',
    expected: 'pass',
  },
  {
    id: 'sec2-csrf-an-unverified-signature-does-not',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: CROSS_SITE,
    verify: 'no',
    expected: 'forgery',
  },
  {
    /*
     * A verifier that cannot answer has not verified anything. Letting the throw
     * propagate turned a malformed `Signature-Input` into a 500 from the fetch
     * handler — an error surface an attacker controls, on the exact path where
     * the answer should be "no".
     */
    id: 'sec2-csrf-a-verifier-that-throws-denies-instead-of-propagating',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: CROSS_SITE,
    verify: 'throws',
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-a-same-origin-request-never-consults-the-verifier',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { 'sec-fetch-site': 'same-origin' },
    verify: 'throws',
    expected: 'pass',
    verifierUnused: true,
  },
  {
    id: 'sec2-csrf-a-safe-method-never-consults-the-verifier',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'GET',
    headers: CROSS_SITE,
    verify: 'yes',
    expected: 'method',
    verifierUnused: true,
  },
  {
    id: 'sec2-csrf-an-unguarded-path-never-consults-the-verifier',
    src: 'janux',
    path: '/_janux/mcp',
    method: 'POST',
    headers: CROSS_SITE,
    verify: 'throws',
    expected: 'pass',
    verifierUnused: true,
  },
  {
    id: 'sec2-csrf-a-signature-does-not-rescue-a-safe-verb-on-an-invocation-path',
    src: 'janux',
    path: '/_janux/agent',
    method: 'GET',
    headers: { 'sec-fetch-site': 'none' },
    verify: 'yes',
    expected: 'method',
    verifierUnused: true,
  },
  {
    // The override header is how a form-only client asks a framework to pretend;
    // pretending here would hand every attacker a verb of their choosing.
    id: 'sec2-csrf-a-method-override-header-does-not-change-the-verb',
    src: 'owasp:csrf-prevention',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { ...CROSS_SITE, 'x-http-method-override': 'GET' },
    expected: 'forgery',
  },
  {
    id: 'sec2-csrf-claiming-to-be-an-agent-in-a-header-is-not-a-signature',
    src: 'janux',
    path: '/_janux/api/shop.wire',
    method: 'POST',
    headers: { ...CROSS_SITE, 'x-janux-origin': 'agent' },
    verify: 'no',
    expected: 'forgery',
  },
];
