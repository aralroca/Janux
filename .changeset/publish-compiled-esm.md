---
'janux': patch
'@janux/server': patch
'@janux/agent': patch
'@janux/vite': patch
'@janux/tailwind': patch
'@janux/cli': patch
'@janux/vercel': patch
'create-janux': patch
---

The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
plain Node project; a Node install smoke test now runs on every change so it cannot regress.
