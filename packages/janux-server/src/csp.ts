/**
 * Strict CSP: the app declares `csp`, the framework nonces every inline script
 * and style it emits, and — when asked — sends the header itself.
 *
 * The whole value of a nonce is that an injected `<script>` cannot guess it, so
 * the default mints a fresh one per request. A fixed nonce is offered because a
 * proxy sometimes picks it first, not because reusing one is a good idea: a
 * nonce that repeats across responses is worth what `'unsafe-inline'` is worth.
 *
 * See https://web.dev/articles/strict-csp.
 */

import type { CspConfig } from 'janux';

/** This request's nonce, and the policy naming it — absent when the app sends its own header. */
export type ResolvedCsp = (req: Request) => { nonce: string; policy?: string };

/**
 * The recommended policy, and mostly notable for what it leaves out: no
 * `'unsafe-inline'`, no `'unsafe-eval'` (Janux never calls `eval` or
 * `new Function`), and no host allowlist — the usual way a strict-looking CSP
 * turns out to be bypassable.
 *
 * `'strict-dynamic'` is what lets the nonced runtime `import()` its island
 * chunks: trust propagates to what a trusted script loads, so the policy does
 * not have to enumerate build output. `object-src` kills the plugin bypass and
 * `base-uri` kills the `<base>` one, neither of which a nonce covers.
 */
export function strictPolicy(nonce: string): string {
  return [`script-src 'nonce-${nonce}' 'strict-dynamic'`, "object-src 'none'", "base-uri 'none'"].join('; ');
}

/** 128 bits of randomness, base64: unguessable, and valid in a CSP source expression. */
function randomNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * The CSP `base64-value` grammar. A nonce is interpolated into a header whose
 * separators are `'` and `;`, so a value carrying either does not merely look
 * wrong — it closes `script-src` and appends directives of its own
 * (`abc'; script-src-elem 'unsafe-inline'; style-src '` turns the policy off).
 * An app is invited to read the nonce off a request header, which is one
 * misconfigured proxy away from being attacker-controlled, so the value is
 * checked here rather than trusted.
 */
const BASE64_VALUE = /^[A-Za-z0-9+/\-_]+={0,2}$/;

let warnedAboutNonce = false;

/** Once per process: a rejected nonce is worth saying, an attack loop is not worth logging. */
function refuseNonce(): string {
  if (!warnedAboutNonce) {
    warnedAboutNonce = true;
    console.warn('Janux: ignoring a `csp.nonce` that is not a CSP base64-value — using a generated one.');
  }

  return randomNonce();
}

function nonceReader(nonce: CspConfig['nonce']): (req: Request) => string {
  const read = typeof nonce === 'function' ? nonce : typeof nonce === 'string' ? () => nonce : randomNonce;

  return (req) => {
    const value = read(req);

    return BASE64_VALUE.test(value) ? value : refuseNonce();
  };
}

function headerBuilder(header: CspConfig['header']): (nonce: string) => string | undefined {
  if (typeof header === 'function') return header;
  if (header === true) return strictPolicy;

  return () => undefined;
}

/**
 * Undefined when the app never asked for CSP — the path where nothing changes.
 *
 * A static export is the other undefined: `output: "static"` has no server to
 * mint a nonce per request or send a header, so a nonce baked into every
 * prerendered file would be inert decoration. Set the policy on the host.
 */
export function resolveCsp(csp: boolean | CspConfig | undefined, staticExport?: boolean): ResolvedCsp | undefined {
  if (!csp) return undefined;
  if (staticExport) {
    console.warn('Janux: `csp` is ignored for `output: "static"` — a prerendered file has no per-request nonce.');

    return undefined;
  }
  const options = csp === true ? { header: true as const } : csp;
  const readNonce = nonceReader(options.nonce);
  const buildHeader = headerBuilder(options.header);

  return (request) => {
    // Read once: the default generator is random, so asking twice would hand
    // the header a different nonce than the document carries.
    const nonce = readNonce(request);

    return { nonce, policy: buildHeader(nonce) };
  };
}
