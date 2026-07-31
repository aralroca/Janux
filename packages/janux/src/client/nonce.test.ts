import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { captureNonce, currentNonce } from './nonce';
import { injectGlowStyles } from './glow';
import { runScriptsWhileStreaming } from './scripts';
import { rescopeSpeculationRules } from './speculation';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/' }));
afterAll(() => GlobalRegistrator.unregister());

/** A document as the shell served it. An empty nonce is an app that does not use CSP. */
function serve(nonce: string, head = ''): void {
  const shellScript = nonce ? `<script type="application/janux+state" nonce="${nonce}"></script>` : '';

  document.head.innerHTML = `${shellScript}${head}`;
  document.body.innerHTML = '';
  captureNonce();
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('captureNonce', () => {
  it('reads the nonce the server put on this document', () => {
    serve('A');

    expect(currentNonce()).toBe('A');
  });

  it('is empty for an app that does not use CSP', () => {
    serve('');

    expect(currentNonce()).toBe('');
  });
});

/**
 * The navigation case, which is where this is easy to get wrong: every response
 * carries a FRESH nonce, but the policy governing the live document is the one
 * that arrived with it. A script the diff brings in carries the next response's
 * nonce — re-running it with that value is a script the browser refuses.
 */
describe('scripts a navigation brings', () => {
  beforeEach(() => serve('A'));

  it('re-executes them under the live document nonce, not the incoming one', async () => {
    // 'B' is what the server served this navigation with, so a script carrying
    // it is one the server emitted.
    const stop = runScriptsWhileStreaming('B');
    const inert = document.createElement('script');

    inert.setAttribute('nonce', 'B');
    inert.textContent = 'globalThis.__ran = true';
    document.body.appendChild(inert);
    await settle();
    stop();

    expect(document.body.firstElementChild!.getAttribute('nonce')).toBe('A');
  });

  /**
   * The bypass this exists to prevent: re-creating a script is what gives it a
   * valid nonce, so re-creating one the server never vouched for would hand an
   * injected `<script>` the exact capability the policy withholds.
   */
  it('refuses to vouch for a script the response did not carry', async () => {
    const stop = runScriptsWhileStreaming('B');
    const injected = document.createElement('script');

    injected.textContent = 'globalThis.__pwned = true';
    document.body.appendChild(injected);
    await settle();
    stop();

    // Left exactly as it arrived: no nonce, and not re-created — so the browser
    // refuses it. (Whether it RUNS is a real-browser question; see e2e/csp.)
    expect(document.body.firstElementChild!.hasAttribute('nonce')).toBe(false);
    expect((document.body.firstElementChild as HTMLScriptElement).dataset.jxRan).toBeUndefined();
  });

  it('re-runs everything, as before, when the app does not use CSP', async () => {
    serve('');
    const stop = runScriptsWhileStreaming();
    const inert = document.createElement('script');

    inert.textContent = 'globalThis.__plain = true';
    document.body.appendChild(inert);
    await settle();
    stop();

    expect((document.body.firstElementChild as HTMLScriptElement).dataset.jxRan).toBe('');
  });

  it('leaves the tag alone when the app does not use CSP', async () => {
    serve('');
    const stop = runScriptsWhileStreaming();
    const inert = document.createElement('script');

    inert.textContent = 'globalThis.__ran = true';
    document.body.appendChild(inert);
    await settle();
    stop();

    expect((document.body.firstElementChild as HTMLScriptElement).hasAttribute('nonce')).toBe(false);
  });
});

describe('runtime-created tags', () => {
  it('nonces the speculation rules the client narrows at boot', () => {
    serve('A', '<script type="speculationrules" id="jx-speculation">{"prefetch":[]}</script>');
    rescopeSpeculationRules();

    expect(document.getElementById('jx-speculation')!.getAttribute('nonce')).toBe('A');
  });

  it('nonces the agent glow stylesheet it injects', () => {
    serve('A');
    injectGlowStyles();

    expect(document.getElementById('janux-glow-styles')!.getAttribute('nonce')).toBe('A');
  });

  it('adds no nonce attribute when the app does not use CSP', () => {
    serve('');
    injectGlowStyles();

    expect(document.getElementById('janux-glow-styles')!.hasAttribute('nonce')).toBe(false);
  });
});
