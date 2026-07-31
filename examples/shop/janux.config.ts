import { defineConfig } from 'janux';

/**
 * The shop runs under a strict CSP — no `'unsafe-inline'`, no `'unsafe-eval'` —
 * which is a one-line claim the e2e suite checks in a real browser, on a fresh
 * load and after an SPA navigation. See recipes/csp.md.
 */
export default defineConfig({
  csp: true,
  navigation: {
    /*
     * Opt-in, like everywhere. The shop asks for it because its pages are small
     * and hover-prefetched, so fetching one in full before the swap costs
     * nothing visible — and in exchange the topbar wordmark is carried between
     * routes instead of blinking out with the rest of the page.
     */
    viewTransitions: true,
  },
});
