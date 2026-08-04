import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Human sessions, with the batteries a cookie needs and nothing an auth
 * provider would want to own.
 *
 * Janux does not authenticate anybody: `issue()` is called by *your* login
 * handler once *your* provider (OIDC, a password check, a magic link) has
 * decided who this is. What lives here is the part every app rewrites and
 * half of them get wrong — a cookie that is signed, that expires, and that
 * rotates:
 *
 * - **Signed**, so the payload is data the server minted rather than data the
 *   browser sent. It is *signed, not encrypted*: put an id and a grant in it,
 *   never a secret.
 * - **Expiring**, absolutely. A cookie past its window is not a session, however
 *   valid its signature.
 * - **Rotating**, so the value on the wire is replaced periodically: a copy
 *   lifted from a log, a proxy or a backup stops working without the user ever
 *   noticing. `issue()` again on privilege change (login) is the other half —
 *   the fixation case.
 *
 * What it deliberately does NOT carry is a CSRF token. A session cookie is an
 * ambient credential and the forgery question is "which page told the browser
 * to send it?", which `refuseCrossSite` already answers once for the whole
 * `/_janux/*` invocation surface, before any handler runs (see `csrf.ts`). A
 * second mechanism here would be a second thing to get wrong, not a second
 * defence. `SameSite=Lax` is set anyway, as hygiene, not as the guarantee.
 */

export interface SessionOptions {
  /** HMAC key. Load it from the environment; rotating it invalidates every session. */
  secret: string;
  /** Cookie name. Default: `janux_session`. */
  name?: string;
  /** How long a freshly issued session lives. Default: 7 days. */
  ttlMs?: number;
  /** Age past which `read()` re-issues the cookie. Default: half the ttl. */
  rotateAfterMs?: number;
  path?: string;
  domain?: string;
  /** Default `Lax`: hygiene on top of the pipeline's cross-site refusal. */
  sameSite?: 'Lax' | 'Strict' | 'None';
  /** Default true. Turn it off only for plain-HTTP local development. */
  secure?: boolean;
  /** Injectable clock, so expiry and rotation are testable without sleeping. */
  now?: () => number;
}

export interface SessionRead<T> {
  data: T;
  expiresAt: number;
  /** A `Set-Cookie` to apply: the session crossed its rotation window. */
  renew?: string;
}

export interface SessionStore<T> {
  name: string;
  /** The `Set-Cookie` value for a new session — call it on login, and on privilege change. */
  issue(data: T): string;
  read(req: Request): SessionRead<T> | undefined;
  /** The `Set-Cookie` value that ends the session on the browser side. */
  clear(): string;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60_000;

interface Envelope<T> {
  d: T;
  /** Issued at, so rotation is a question about this cookie rather than about the clock. */
  i: number;
  e: number;
}

/** The `name=value` of a cookie header, without a RegExp built from app input. */
function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function parseEnvelope<T>(body: string): Envelope<T> | undefined {
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Envelope<T>;
  } catch {
    return undefined;
  }
}

function matches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionStore<T>(options: SessionOptions): SessionStore<T> {
  const { secret, name = 'janux_session', ttlMs = DEFAULT_TTL_MS, now = Date.now } = options;
  const rotateAfterMs = options.rotateAfterMs ?? ttlMs / 2;
  const sign = (body: string): string => createHmac('sha256', secret).update(body).digest('base64url');

  const attributes = (maxAgeMs: number): string =>
    [
      `Path=${options.path ?? '/'}`,
      options.domain ? `Domain=${options.domain}` : '',
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
      'HttpOnly',
      options.secure === false ? '' : 'Secure',
      `SameSite=${options.sameSite ?? 'Lax'}`,
    ]
      .filter(Boolean)
      .join('; ');

  const issue = (data: T): string => {
    const issuedAt = now();
    const envelope: Envelope<T> = { d: data, i: issuedAt, e: issuedAt + ttlMs };
    const body = Buffer.from(JSON.stringify(envelope)).toString('base64url');

    return `${name}=${body}.${sign(body)}; ${attributes(ttlMs)}`;
  };

  /** What a cookie carries, once the signature over exactly those two parts checks out. */
  const verified = (cookie: string | undefined): Envelope<T> | undefined => {
    const [body, signature, extra] = (cookie ?? '').split('.');

    if (!body || !signature || extra !== undefined || !matches(signature, sign(body))) return undefined;

    return parseEnvelope<T>(body);
  };

  /** Verified, unexpired, and told whether it is old enough to be replaced. */
  const read = (req: Request): SessionRead<T> | undefined => {
    const envelope = verified(cookieValue(req.headers.get('cookie'), name));

    if (!envelope || now() > envelope.e) return undefined;

    return {
      data: envelope.d,
      expiresAt: envelope.e,
      renew: now() >= envelope.i + rotateAfterMs ? issue(envelope.d) : undefined,
    };
  };

  return { name, issue, read, clear: () => `${name}=; ${attributes(0)}` };
}
