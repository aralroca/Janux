---
"janux": minor
"@janux/vite": minor
"@janux/server": minor
"@janux/cli": minor
---

Declarative headers, page redirects, image escape hatches, live dev config, and a foreign-safe navigation.

`headers` in `janux.config` attaches response headers by route prefix — `{from, except?, headers}` entries accumulate in order, so a security baseline and a narrow COOP/COEP carve-out for the pages that need `SharedArrayBuffer` coexist without a custom server.

`redirect(location, status = 307)` can now be returned from a page, symmetric with `notFound()`: the resolved document short-circuits into a real HTTP redirect instead of rendering a body.

Images gain two escape hatches for apps that serve their own assets: `images: false` turns the optimizer off wholesale, and the optimizer skips (with a warning naming the file) instead of failing when it meets a format it cannot process. A hand-written `public/sw.js` now survives `retireServiceWorker`.

`janux dev` re-reads `janux.config.ts` after an edit — the module cache is evicted per read, so config changes land without a restart.

Navigation is safe around live foreign (React) islands: the first foreign commit is flushed synchronously so a swap never shows an empty host, and the streaming DOM diff treats mounted foreign hosts as opaque leaves (`diff-dom-streaming` ≥ 0.6.11), so a morph no longer races the framework that owns those subtrees.
