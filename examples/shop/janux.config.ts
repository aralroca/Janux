import { defineConfig } from 'janux';

/**
 * The shop runs under a strict CSP — no `'unsafe-inline'`, no `'unsafe-eval'` —
 * which is a one-line claim the e2e suite checks in a real browser, on a fresh
 * load and after an SPA navigation. See recipes/csp.md.
 */
export default defineConfig({ csp: true });
