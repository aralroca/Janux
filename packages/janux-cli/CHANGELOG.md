# @janux/cli

## 0.6.0

### Patch Changes

- `janux dev` shows a failure inside an `intent()`, `effect()` or `source()` with the chain that explains it — route,
  `_layout` chain, island, the named behavior, and, for an invocation, the guard the pipeline resolved and the origin
  it resolved it for — above the JS stack. The original error is still logged to the console, which a failed intent
  previously never reached. The overlay is dev-only and eliminated from production builds.

  Sourcemaps are on: full in dev, with the framework's own frames resolvable, and `hidden` in production, so `.map`
  files exist for an error tracker without a `sourceMappingURL` reaching the browser.

  `janux info` prints versions, the resolved config, detected adapters, active zero-config integrations and every
  route as markdown to paste into an issue unedited.

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

## 0.5.0

### Minor Changes

- `output: "static"` emits the Markdown projection next to every page.

### Patch Changes

- Suspense-only pages ship their runtime.

## 0.4.0

Released with the framework; no changes of its own.
