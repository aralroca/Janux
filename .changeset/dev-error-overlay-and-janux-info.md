---
'janux': patch
'@janux/cli': patch
'@janux/vite': patch
---

`janux dev` shows a failure inside an `intent()`, `effect()` or `source()` with the chain that explains it — route,
`_layout` chain, island, the named behavior, and, for an invocation, the guard the pipeline resolved and the origin
it resolved it for — above the JS stack. The original error is still logged to the console, which a failed intent
previously never reached. The overlay is dev-only and eliminated from production builds.

Sourcemaps are on: full in dev, with the framework's own frames resolvable, and `hidden` in production, so `.map`
files exist for an error tracker without a `sourceMappingURL` reaching the browser.

`janux info` prints versions, the resolved config, detected adapters, active zero-config integrations and every
route as markdown to paste into an issue unedited.

`janux build` now pins `NODE_ENV=production` before invoking Vite: Vite reads `NODE_ENV` ahead of the mode when
deciding `import.meta.env.DEV`, so a shell exporting `NODE_ENV=development` used to produce a build with dev-only
branches in it.
