# @janux/agent

## 0.6.0

### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

## 0.5.0

### Minor Changes

- MCP specification 2026-07-28: the outbound client speaks the new era first and falls back to the old one.

## 0.4.0

Released with the framework; no changes of its own.
