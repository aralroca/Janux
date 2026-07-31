import { describe, expect, it } from 'bun:test';
import { jsx } from 'janux';
import { docExample } from '../doc-example';

/**
 * recipes/csp.md promises a policy and a document that agree with each other,
 * so both documented servers are booted and driven with real Requests. The
 * assertions are sweeps over the emitted document: the recipe's claim is "all
 * of it", and a claim about everything cannot be checked by sampling.
 */

const ROUTES = { routesDir: undefined, routes: { '/': () => jsx('h1', { children: 'Home' }) } };

const tags = (html: string) => [...html.matchAll(/<(?:script|style)\b[^>]*>/g)].map(([tag]) => tag);

async function serverFrom(index: number, headers?: Record<string, string>) {
  const { server } = await docExample('apps/docs/content/recipes/csp.md', index, {
    "routesDir: 'src/routes',": 'routes: (globalThis as any).__cspRoutes,',
  });
  const response = await server.fetch(new Request('http://test/', { headers }));

  return { policy: response.headers.get('content-security-policy'), html: await response.text() };
}

(globalThis as any).__cspRoutes = ROUTES.routes;

describe('recipes/csp.md', () => {
  it('the one-line server nonces every tag with the nonce its header names', async () => {
    const { policy, html } = await serverFrom(0);
    const nonce = /'nonce-([^']+)'/.exec(policy!)![1]!;

    expect(policy).toBe(
      `script-src 'nonce-${nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'`,
    );
    expect(tags(html).length).toBeGreaterThan(0);
    expect(tags(html).filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);
  });

  /**
   * The "bring your own" form: the proxy's nonce reaches the document, and
   * `strictPolicy` composes rather than replaces — the recipe's whole point.
   */
  it('takes the nonce from the request header and extends the strict policy', async () => {
    const { policy, html } = await serverFrom(2, { 'x-nonce': 'from-proxy' });

    expect(policy).toBe(
      "script-src 'nonce-from-proxy' 'strict-dynamic'; object-src 'none'; base-uri 'none'; " +
        "style-src 'nonce-from-proxy'; connect-src 'self'",
    );
    expect(tags(html).filter((tag) => !tag.includes('nonce="from-proxy"'))).toEqual([]);
  });
});
