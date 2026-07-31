---
title: Monorepo setup
description: "A Janux app is a normal Bun workspace member: nothing in the framework needs to know it lives in a monorepo."
---

# Monorepo setup

A Janux app is a normal Bun workspace member: nothing in the framework needs to know it lives in a monorepo. What *does* need care is where you run the CLI from, and how a shared package's islands reach the client runtime.

```
acme/
├── package.json          # { "workspaces": ["apps/*", "packages/*"] }
├── apps/
│   └── web/              # a scaffolded Janux app
│       ├── package.json  # deps: janux, @janux/server, @janux/cli, @acme/ui
│       └── src/
└── packages/
    └── ui/               # shared components — static ones and islands
        ├── package.json  # { "exports": { ".": "./src/index.ts" } }
        └── src/
```

```json
{
  "name": "acme",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun run --cwd apps/web dev",
    "build": "bun run --cwd apps/web build",
    "start": "bun run --cwd apps/web start"
  }
}
```

## The CLI has no `--root`: cwd is the app

`janux dev|build|start` resolve every convention (`src/routes`, `src/server/*.api.ts`, `janux.config.ts`, `dist/client`) from the **current working directory**. Run them from the app, not from the repo root — that's what `bun run --cwd apps/web …` above is for.

Run `janux build` at the root and it succeeds while doing nothing, which is the confusing part:

```
janux build: nothing to bundle — fully static app (0 KB JS).
```

No routes found, no client entry found, exit code 0, no `dist/`. If you see that line and your app has islands, check your cwd first.

## A shared package exports components, not a build

Keep the shared package as **source**. Point `exports` at the `.tsx` entry and let the app's Vite pipeline compile it — no build step, no `dist`, no duplicated JSX config:

```json
{
  "name": "@acme/ui",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": { "janux": "*" }
}
```

`janux` belongs in `peerDependencies`: the app owns the version, and one copy of the runtime is what keeps signals and the island registry consistent (the Vite plugin also dedupes `janux` for exactly this reason).

## Static components just work; islands must be registered

A static component from the package renders on the server and ships nothing:

```tsx
// packages/ui/src/Badge.tsx
export function Badge({ label }: { label: string }) {
  return <span class="badge">{label}</span>;
}
```

An island — anything built with `component({ state, intents })` — also needs to reach the **client** registry, so add it to the app's `boot()` exactly like a local one:

```ts
// apps/web/src/client.ts
import { boot } from 'janux/client';
import { Toggle } from '@acme/ui';
import { Counter } from './components/Counter';

boot({ defs: [Counter, Toggle], glow: true });
```

Forget that line and the island server-renders, shows its markup, and never wakes up on interaction — the runtime has no def to mount.

Registered, a shared island is indistinguishable from a local one: it SSRs as `<janux-island data-jx="toggle#default">`, its intent markers are in the HTML, and the manifest exposes it as the tool `toggle.flip` and the resource `ui://toggle`.

## Two apps, one package

Since the def carries its own `name`, two apps consuming `@acme/ui` expose the same tool names — which is the point: the shared component brings its agent surface with it. Keep names unique *within* an app (`data-jx` keys are derived from them) and give a second instance on the same page an explicit `key`.

## Server code in a shared package

`api()` definitions are collected from the **app's** `src/server/*.api.ts` — a shared package's api modules are not discovered. Export a plain async function from the package and wrap it in the app:

```ts
// apps/web/src/server/billing.api.ts
import { api } from '@janux/server';
import { schema, str } from 'janux';
import { chargeCustomer } from '@acme/billing';

export const charge = api({
  description: 'Charge a customer',
  input: schema({ customerId: str() }),
  run: ({ input }) => chargeCustomer(input.customerId),
});
```

The tool name comes from the app's file and export (`billing.charge`), so each app decides what it exposes and under which guard.

## Testing

Component tests need no app: `createInstance` runs a def anywhere, so `packages/ui` can test its own islands with `bun test` and no Vite, no server, no DOM. See [testing components](/docs/recipes/testing-components).

Related: [Project structure](/docs/getting-started/project-structure) · [CLI](/docs/reference/cli) · [Custom server](/docs/recipes/custom-server)
