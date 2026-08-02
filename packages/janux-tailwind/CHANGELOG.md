# @janux/tailwind

## 0.6.0

### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

## 0.5.0

Released with the framework; no changes of its own.

## 0.4.0

Released with the framework; no changes of its own.
