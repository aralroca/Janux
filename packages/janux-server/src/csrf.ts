import { json } from './http';

/**
 * Cross-site request forgery, refused once for the whole `/_janux/*` surface.
 *
 * Invariant 4 — guards are enforced at the invocation pipeline, not in app code —
 * is why this lives here and not in four route handlers. An app whose `ctx` comes
 * from a session cookie has authenticated the *browser*, never the page that told
 * the browser to fetch: without this, `evil.example` can POST
 * `/_janux/api/shop.refundOrder` and the cookie rides along, and every `guard`,
 * schema and audit entry downstream faithfully records a forged call as genuine.
 *
 * Two signals, in the order the platform gives them:
 *
 * 1. **Fetch metadata** (`Sec-Fetch-Site`) — the primary check. It is set by the
 *    browser and is a forbidden header name, so page JS cannot forge it.
 * 2. **`Origin`, then `Referer`** — the fallback for a browser too old to send
 *    fetch metadata (Safari before 16.4), and how a non-browser client declares
 *    which origin it is acting for.
 *
 * Absence of *both* on a mutating method is a refusal, not a pass. Inverting that
 * is the classic bypass: an attacker cannot suppress fetch metadata, so anything
 * that arrives with no evidence at all has not earned the benefit of the doubt.
 *
 * @see https://developer.mozilla.org/docs/Web/HTTP/Headers/Sec-Fetch-Site
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */

/** The read-only methods. Not a pass on an invocation endpoint — see below. */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Every path where a request reaches app code that can change something, while
 * carrying whatever credentials the caller's browser holds. Prefixes ending in
 * `/` match a subtree.
 *
 * Listed positively rather than as "`/_janux/*` except…" because the rest of that
 * namespace is reads — the manifest, `.md` projections, the runtime script — and
 * `/_janux/mcp` is an API for *external* MCP clients, which are cross-site by
 * definition and authenticate with a bearer token (`mcpAuth`) instead of an
 * ambient cookie. Nothing there is forgeable, and a sweep would only have to
 * carve them back out one by one.
 */
const INVOCATION_PATHS = ['/_janux/api/', '/_janux/approve', '/_janux/reject', '/_janux/agent', '/_janux/llm'];

export interface CsrfPolicy {
  /** Origins allowed besides the app's own. Empty ⇒ same-origin only. */
  allowedOrigins?: string[];
  /** Web Bot Auth verification, when the app configured `agents`. */
  verifiedAgent?: (req: Request) => Promise<boolean>;
}

function isInvocation(pathname: string): boolean {
  return INVOCATION_PATHS.some((path) => (path.endsWith('/') ? pathname.startsWith(path) : pathname === path));
}

/** The origin of a URL-shaped header value; `undefined` for `null`, `""` or junk. */
function originOf(value: string | null): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** Which origin the request claims to come from: `Origin` if it has one, else `Referer`'s. */
function declaredOrigin(req: Request): string | undefined {
  return originOf(req.headers.get('origin')) ?? originOf(req.headers.get('referer'));
}

/**
 * `none` is a user-initiated load (address bar, bookmark): there is no initiating
 * page, so there is nobody to have forged it. `same-site` is *not* enough on its
 * own — a sibling subdomain shares the cookie jar, so it goes through the same
 * origin comparison as a cross-site request and needs the allowlist to pass.
 */
function sameSiteByHeaders(req: Request, allowed: string[]): boolean {
  const site = req.headers.get('sec-fetch-site');

  if (site === 'same-origin' || site === 'none') return true;
  const declared = declaredOrigin(req);

  return declared !== undefined && (declared === new URL(req.url).origin || allowed.includes(declared));
}

/**
 * A verified agent is exempt, and the distinction is the whole point: it proved
 * possession of a private key *on this request*, whereas a forged request proves
 * only that some browser somewhere holds a cookie. An attacker's page cannot
 * sign, so the exemption cannot be borrowed — and a legitimate Web Bot Auth
 * caller is cross-site by nature, so without it agent traffic would be dead.
 *
 * Only the signature counts. `x-janux-origin: agent` is a free-to-type hint about
 * which guard rules apply, never a claim of identity.
 */
/**
 * A verifier that cannot answer has not verified anything.
 *
 * Letting it throw turned a malformed `Signature-Input` — or a key store that was
 * momentarily unreachable — into a 500 from the fetch handler, on the one path
 * whose answer should be "no". The exemption is a claim to prove, so failing to
 * prove it denies, like `resolveApiGuard` does with a guard that blows up.
 */
async function verifiedAgent(req: Request, policy: CsrfPolicy): Promise<boolean> {
  try {
    return (await policy.verifiedAgent?.(req)) === true;
  } catch {
    return false;
  }
}

export async function refuseCrossSite(req: Request, pathname: string, policy: CsrfPolicy): Promise<Response | undefined> {
  if (!isInvocation(pathname)) return undefined;
  /*
   * A read-only method is refused rather than waved through, because none of
   * these endpoints treats it as a read: they parse the body and run the tool
   * whatever the verb, so `GET /_janux/api/payments.transfer` executes with the
   * input schema's defaults — and a GET needs no fetch() at all to forge. An
   * `<img src>` on any page in the world is enough.
   */
  if (SAFE.has(req.method.toUpperCase())) return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (sameSiteByHeaders(req, policy.allowedOrigins ?? [])) return undefined;
  if (await verifiedAgent(req, policy)) return undefined;

  return json({ ok: false, error: 'cross_site_denied' }, 403);
}
