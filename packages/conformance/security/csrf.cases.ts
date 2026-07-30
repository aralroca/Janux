import type { Case } from '../support/case';

/**
 * Cross-site request forgery against the invocation pipeline.
 *
 * Invariant 4 says guards are enforced at the invocation pipeline rather than in
 * app code — so a hole *there* is not one app's bug, it is every app's. An app
 * whose `ctx` comes from a session cookie authenticates the browser, not the
 * page that told the browser to fetch: `evil.example` can POST
 * `/_janux/api/shop.refundOrder` and the cookie rides along.
 *
 * Asserted per posture rather than per header, because the defence is a decision
 * about *who asked* — the headers are only the evidence. Fetch metadata is the
 * primary signal and `Origin`/`Referer` the fallback for a browser too old to
 * send it; the rows below pin both, and pin that missing evidence is a refusal
 * rather than a pass (that inversion is the classic CSRF bypass).
 *
 * Sources: MDN `Sec-Fetch-Site`; OWASP CSRF Prevention Cheat Sheet
 * ("Verifying Origin With Standard Headers").
 */
export interface CsrfCase {
  /** Which `/_janux/*` surface the request targets. */
  endpoint: 'api' | 'approve' | 'reject' | 'agent' | 'mcp' | 'manifest';
  method: 'GET' | 'POST' | 'PATCH';
  /** Sent verbatim, as the browser (or the attacker's page) would send them. */
  headers: Record<string, string>;
  /** `allowedOrigins` the app was configured with; absent ⇒ its own origin only. */
  allowedOrigins?: string[];
  /** Carries a Web Bot Auth signature from a key the app trusts. */
  signed?: boolean;
  /** False ⇒ the pipeline must refuse *before* the route runs, so nothing mutates. */
  allowed: boolean;
  /** The envelope a refusal must carry. Defaults to the forgery one, 403. */
  refusal?: { status: number; error: string };
}

/** A read-only verb on an endpoint that has no read: refused as such, not as forgery. */
const NOT_ALLOWED = { status: 405, error: 'method_not_allowed' };

export type CsrfRow = Case<CsrfCase>;

const SELF = 'http://test';
const EVIL = 'https://evil.example';
const PARTNER = 'https://partner.example';

/** Every mutating endpoint the framework exposes on `/_janux/*`. */
const MUTATING_ENDPOINTS: CsrfCase['endpoint'][] = ['api', 'approve', 'reject', 'agent'];

/**
 * One posture per row: what the request looks like when it arrives, and whether
 * the pipeline should serve it. Only exercised against `/_janux/api/*` — the
 * decision is made once for every route, and the per-endpoint rows below are
 * what assert that all four actually reach it.
 */
const POSTURES: Array<Omit<CsrfCase, 'endpoint' | 'method'> & { key: string }> = [
  // ── fetch metadata, the primary signal ──────────────────────────────────────
  { key: 'user-initiated', headers: { 'sec-fetch-site': 'none' }, allowed: true },
  { key: 'cross-site-without-origin', headers: { 'sec-fetch-site': 'cross-site' }, allowed: false },
  // A sibling subdomain is same-*site* but not same-origin, and cookies are
  // shared across it: a foothold on one subdomain must not become one on all.
  { key: 'same-site-subdomain', headers: { 'sec-fetch-site': 'same-site', origin: 'http://evil.test' }, allowed: false },

  // ── the Origin/Referer fallback, for a browser that sends no Sec-Fetch-* ────
  { key: 'legacy-same-origin', headers: { origin: SELF }, allowed: true },
  { key: 'legacy-cross-origin', headers: { origin: EVIL }, allowed: false },
  { key: 'legacy-referer-same-origin', headers: { referer: `${SELF}/checkout` }, allowed: true },
  { key: 'legacy-referer-cross-origin', headers: { referer: `${EVIL}/lure` }, allowed: false },
  // The bypass this whole table exists to forbid: no evidence is not consent.
  { key: 'no-metadata-at-all', headers: {}, allowed: false },
  { key: 'origin-null', headers: { origin: 'null' }, allowed: false },

  // ── the configurable allowlist ──────────────────────────────────────────────
  {
    key: 'allowlisted-partner',
    headers: { 'sec-fetch-site': 'cross-site', origin: PARTNER },
    allowedOrigins: [PARTNER],
    allowed: true,
  },
  {
    key: 'unlisted-while-allowlist-set',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    allowedOrigins: [PARTNER],
    allowed: false,
  },
];

/** The attacker's page, and the app's own page, against one endpoint. */
const crossSite = (endpoint: CsrfCase['endpoint']): CsrfRow => ({
  id: `csrf-${endpoint}-refuses-cross-site-page`,
  src: 'janux',
  endpoint,
  method: 'POST',
  headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
  allowed: false,
});

const sameOrigin = (endpoint: CsrfCase['endpoint']): CsrfRow => ({
  id: `csrf-${endpoint}-serves-same-origin-page`,
  src: 'janux',
  endpoint,
  method: 'POST',
  headers: { 'sec-fetch-site': 'same-origin', origin: SELF },
  allowed: true,
});

export const CSRF_CASES: CsrfRow[] = [
  ...MUTATING_ENDPOINTS.flatMap((endpoint) => [crossSite(endpoint), sameOrigin(endpoint)]),
  ...POSTURES.map(({ key, ...posture }) => ({
    id: `csrf-api-${key}`,
    src: 'janux',
    endpoint: 'api' as const,
    method: 'POST' as const,
    ...posture,
  })),

  /*
   * A verified agent is not a victim's browser, and the difference is the point:
   * it proves possession of a private key on this very request, where a forged
   * request proves only that a browser somewhere holds a cookie. An attacker's
   * page cannot sign, so the exemption cannot be borrowed — and a legitimate
   * agent is cross-site by nature, so without it Web Bot Auth would be dead.
   */
  {
    id: 'csrf-api-serves-signed-agent-cross-site',
    src: 'janux',
    endpoint: 'api',
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    signed: true,
    allowed: true,
  },
  {
    id: 'csrf-agent-serves-signed-agent-cross-site',
    src: 'janux',
    endpoint: 'agent',
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    signed: true,
    allowed: true,
  },
  /*
   * Not just POST. `handleApi` never looks at the method — it reads the body and
   * runs the tool — so every verb that is not read-only has to be guarded. A
   * denylist of the mutating ones is the shape that gets this wrong.
   */
  {
    id: 'csrf-api-refuses-cross-site-patch',
    src: 'janux',
    endpoint: 'api',
    method: 'PATCH',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    allowed: false,
  },
  /*
   * The nastiest shape of the same hole, and the reason a read-only verb cannot
   * simply be waved through: `handleApi` runs the tool on a GET too, with the
   * input schema's DEFAULTS for a body it never received. No fetch(), no CORS, no
   * script — `<img src="https://victim.app/_janux/api/payments.transfer">` on any
   * page in the world, and the browser attaches the session cookie itself.
   *
   * Refused as a method error rather than as forgery, because it is not one:
   * these endpoints have no read, so the app's own page gets the same answer.
   */
  {
    id: 'csrf-api-refuses-a-cross-site-get',
    src: 'janux',
    endpoint: 'api',
    method: 'GET',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    allowed: false,
    refusal: NOT_ALLOWED,
  },
  {
    id: 'csrf-api-refuses-a-same-origin-get-too',
    src: 'janux',
    endpoint: 'api',
    method: 'GET',
    headers: { 'sec-fetch-site': 'same-origin', origin: SELF },
    allowed: false,
    refusal: NOT_ALLOWED,
  },
  {
    id: 'csrf-agent-refuses-a-cross-site-get',
    src: 'janux',
    endpoint: 'agent',
    method: 'GET',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    allowed: false,
    refusal: NOT_ALLOWED,
  },
  /* Claiming to be an agent is not being one: the header is free to type. */
  {
    id: 'csrf-api-refuses-unsigned-agent-claim-cross-site',
    src: 'janux',
    endpoint: 'api',
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL, 'x-janux-origin': 'agent' },
    allowed: false,
  },

  /*
   * What must NOT be caught. `/_janux/mcp` is an API for external MCP clients —
   * they are cross-site by definition and carry a bearer token, not a cookie —
   * and a safe method cannot forge anything, so reads stay reachable.
   */
  {
    id: 'csrf-mcp-serves-external-clients-cross-site',
    src: 'janux',
    endpoint: 'mcp',
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    allowed: true,
  },
  {
    id: 'csrf-manifest-serves-safe-method-cross-site',
    src: 'janux',
    endpoint: 'manifest',
    method: 'GET',
    headers: { 'sec-fetch-site': 'cross-site', origin: EVIL },
    allowed: true,
  },
];
