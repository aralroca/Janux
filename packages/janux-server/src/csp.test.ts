import { describe, expect, it } from 'bun:test';
import { resolveCsp, strictPolicy } from './csp';

const req = () => new Request('http://test/');

describe('resolveCsp', () => {
  it('stays out of the way when the app never asked for CSP', () => {
    expect(resolveCsp(undefined)).toBeUndefined();
    expect(resolveCsp(false)).toBeUndefined();
  });

  /*
   * A nonce reused across responses is worth exactly as much as
   * 'unsafe-inline': an injected script can just read it off the page it was
   * injected into and reuse it. So the default has to be per-request.
   */
  it('generates a fresh unguessable nonce per request by default', () => {
    const csp = resolveCsp(true)!;
    const nonces = Array.from({ length: 50 }, () => csp(req()).nonce);

    expect(new Set(nonces).size).toBe(50);
    expect(nonces.every((nonce) => nonce.length >= 16)).toBe(true);
  });

  it('takes a fixed nonce, for an app whose proxy already picked one', () => {
    expect(resolveCsp({ nonce: 'fixed' })!(req()).nonce).toBe('fixed');
  });

  it('takes a per-request function, for an app that derives it from the request', () => {
    const csp = resolveCsp({ nonce: (request) => new URL(request.url).searchParams.get('n') ?? '' })!;

    expect(csp(new Request('http://test/?n=abc')).nonce).toBe('abc');
  });

  it('emits no header unless asked: the app may set its own', () => {
    expect(resolveCsp({ nonce: 'fixed' })!(req()).policy).toBeUndefined();
  });

  it('emits the strict policy naming the very nonce it just minted', () => {
    const { nonce, policy } = resolveCsp(true)!(req());

    expect(policy).toBe(strictPolicy(nonce));
  });

  it('lets the app build its own policy from the request nonce', () => {
    const csp = resolveCsp({ nonce: 'abc', header: (nonce) => `script-src 'nonce-${nonce}'` })!;

    expect(csp(req()).policy).toBe("script-src 'nonce-abc'");
  });

  /*
   * A prerendered file has no per-request anything: baking a random nonce into
   * every page would look like protection while enforcing nothing.
   */
  it('stands down for a static export', () => {
    expect(resolveCsp(true, true)).toBeUndefined();
  });

  /*
   * The documented recipe reads the nonce off a request header, which is one
   * misconfigured proxy away from attacker-controlled — and `'` and `;` are the
   * header's own separators, so an unchecked value does not merely look wrong,
   * it appends directives that switch the policy off.
   */
  it('refuses a nonce that would inject CSP directives', () => {
    const csp = resolveCsp({ nonce: (request) => request.headers.get('x-nonce') ?? '', header: true })!;
    const forged = "abc'; script-src-elem 'unsafe-inline'; style-src '";
    const { nonce, policy } = csp(new Request('http://test/', { headers: { 'x-nonce': forged } }));

    expect(nonce).not.toBe(forged);
    expect(policy).toBe(strictPolicy(nonce));
    expect(policy).not.toContain('unsafe-inline');
  });

  it('keeps a well-formed nonce exactly as the app supplied it', () => {
    expect(resolveCsp({ nonce: 'aB3+/x-_==' })!(req()).nonce).toBe('aB3+/x-_==');
  });
});

/**
 * The policy a security review reads. It is the shape web.dev calls a strict
 * CSP; what matters most is what is ABSENT — no `'unsafe-inline'`, no
 * `'unsafe-eval'`, no host allowlist to bypass.
 */
describe('strictPolicy', () => {
  const policy = strictPolicy('abc');

  /*
   * Scripts by nonce only, `strict-dynamic` for what they go on to load,
   * `worker-src` stated so the app's own service worker is not refused by the
   * `script-src` it would otherwise inherit, and the two holes a nonce alone
   * leaves open: `object-src` (the plugin bypass) and `base-uri` (the `<base>`
   * one).
   */
  it('is exactly the recommended strict policy', () => {
    expect(policy).toBe(
      "script-src 'nonce-abc' 'strict-dynamic'; worker-src 'self'; object-src 'none'; base-uri 'none'",
    );
  });

  /** Stated separately because it is the property a future edit must not break. */
  it('never weakens itself with unsafe-inline or unsafe-eval', () => {
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });
});

/**
 * `worker-src` has no default of its own: it falls back to `child-src`, then
 * `script-src`. A nonce cannot be attached to a worker script the way it can
 * to a `<script>` tag, so under the policy above `worker-src` inherited a
 * source list a same-origin worker can never satisfy — and `janux build`
 * emitting `/sw.js` would have been a feature that silently never registered
 * on any app that also wrote `csp: true`. Same-origin only, which is the
 * strongest thing that can be said about a worker and still say yes.
 */
describe('strictPolicy and workers', () => {
  it('allows a same-origin service worker', () => {
    expect(strictPolicy('abc')).toContain("worker-src 'self'");
  });

  it('allows no other origin to supply one', () => {
    expect(strictPolicy('abc')).not.toContain('worker-src *');
  });
});
