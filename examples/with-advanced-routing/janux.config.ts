import { defineConfig } from 'janux';

/**
 * The other half of this app's URL space: the addresses it answers that have no
 * file behind them.
 *
 * Every pattern here is written in the same grammar as the route files — the KB
 * moved its articles out of `/kb` without touching a single one of them, and
 * `[slug]` means here exactly what it means in `wiki/[slug].tsx`.
 */
export default defineConfig({
  redirects: [
    // The articles never moved; the prefix did. 308 keeps the method and tells
    // crawlers the old address is gone for good.
    { from: '/kb/[slug]', to: '/wiki/[slug]' },
    // A whole tree folded into one page — the tail is dropped on purpose.
    { from: '/legacy-docs/[...path]', to: '/docs/[...path]' },
    // A page that is gone rather than moved, so the old URL points at its heir.
    { from: '/plans', to: '/pricing', status: 301 },
  ],
  rewrites: [
    // The handbook IS the docs tree under the name people still type. The pages
    // are served from `docs/[...path].tsx` and the address bar keeps `/handbook/…`.
    { from: '/handbook/[...path]', to: '/docs/[...path]' },
  ],
});
