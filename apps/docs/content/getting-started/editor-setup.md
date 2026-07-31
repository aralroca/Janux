---
title: Editor setup
description: The TypeScript and editor configuration a Janux app needs — what the scaffolder writes for you, and what to add when JSX suddenly types as any.
---

# Editor setup

`bun create janux` writes all of this for you. This page is what to do when you're adding Janux to an existing project — or when JSX suddenly types as `any`.

## tsconfig.json

```json title="tsconfig.json" {10,11}
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun"],
    "noEmit": true,
    "jsx": "react-jsx",
    "jsxImportSource": "janux"
  },
  "include": ["src/**/*"]
}
```

The two lines that matter:

- **`"jsx": "react-jsx"`** — the automatic runtime. No `import { jsx }` in your files.
- **`"jsxImportSource": "janux"`** — JSX resolves to Janux's runtime, not React's. Get this wrong and every element types as `any` while still *running* fine, which is the confusing failure mode.

`"moduleResolution": "bundler"` lets TypeScript follow the package's `exports` map (`janux/client`, `janux/interop`, `janux/query`…).

## Per-file React override

A file that must render with React (a component you mount via [`foreign()`](/docs/guide/interop)) opts out with a pragma — everything else in the project keeps the Janux runtime:

```tsx {1}
/** @jsxImportSource react */
export function Mixer({ band, onBand }: Props) {
  return <input type="range" value={band} onChange={(event) => onBand(Number(event.target.value))} />;
}
```

## VS Code

No extension is required. Two settings help:

```json title=".vscode/settings.json"
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true
}
```

Using the workspace TypeScript matters when your global version is older than the project's — Janux's types rely on recent inference.

## Typechecking in CI

```bash
bunx tsc --noEmit
```

Pair it with [`janux verify`](/docs/reference/cli), which fails the build when an agent-reachable `intent()` or `api()` has no `description` — an incomplete agent contract is a bug types can't catch.

## Troubleshooting

| Symptom | Cause |
|---|---|
| JSX elements are `any`, no autocomplete | `jsxImportSource` missing or set to `react` |
| `Cannot find module 'janux/client'` | `moduleResolution` isn't `bundler` (or `node16`+) |
| `Property 'on' does not exist` on an element | the file is compiling with React's JSX types — check the pragma |
| Intent bag fields type as `any` | `strict` is off, or `state` was written without `schema()` |

Next: [Components](/docs/guide/components) · [Schema types](/docs/guide/schema)
