# Deploying to Vercel

Vercel runs functions on Bun, and a Janux server is already the shape that runtime wants — Web `Request` in, Web `Response` out. `@janux/vercel` is the glue, for both of the framework's outputs: a **Bun server** (SSR, `api()` endpoints, the manifest, MCP, the copilot) or a **static export** (prerendered HTML on the CDN, no runtime).

This site runs on it. [janux.build](https://janux.build) is `apps/docs`, deployed exactly as described here.

## Install and scaffold

```bash
bun add @janux/vercel
bunx janux-vercel --include content --max-duration 60
```

```bash title="what it writes"
janux-vercel: wrote vercel.json
janux-vercel: bundled the app (12155 KB)
janux-vercel: wrote .vercel/output (output: bun).
```

Two things, with different lifetimes. `vercel.json` is a **source file** — Vercel reads it before running your build, so no build could have produced it — and it is three lines long:

```json title="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bun run build && bunx janux-vercel --include content --max-duration 60",
  "bunVersion": "1.x"
}
```

- **`buildCommand`** builds the app, then the deployment. The flags you scaffolded with are baked in, so a deployment is one command with no arguments to remember.
- **`bunVersion`** puts the deployment on Bun — the runtime Janux targets, so the server you tested locally is the server that runs.

`.vercel/output` is the deployment itself, rebuilt on every build. Ignore it:

```bash title=".gitignore"
.vercel
```

## What the adapter writes

A [Build Output API](https://vercel.com/docs/build-output-api) directory — the deployment, described as files, with nothing left for the platform to infer:

```txt
.vercel/output/
├── config.json                    # routes: static files first, then the app
├── static/                        # dist/client, served by the CDN
└── functions/index.func/
    ├── .vc-config.json            # runtime, handler, maxDuration
    ├── index.js                   # the handler
    ├── .janux/server.js           # the app, bundled
    ├── src/                       # the routes tree, read at boot
    └── content/                   # --include: whatever your app reads
```

The alternative is letting the platform build `api/**` for you, which means letting it **trace** what your function needs. A traced function cannot leave a workspace: `node_modules/janux` is a symlink to `packages/janux`, outside the project, and packaging one fails the deployment outright — *"the framework produced an invalid deployment package for a Serverless Function. Typically this means that the framework produces files in symlinked directories."* Writing the output ourselves means nothing is traced: these bytes, that config.

## Why the app is bundled

A Janux server imports your app's own source when it boots — routes, layouts, `*.api.ts`, `src/agent.ts`, stores, i18n, middleware — resolving `janux` from your `node_modules`. That is how `janux start` runs an app with no server bundle at all, and it is the wrong shape for a function: there is no `node_modules` beside it, so an app resolved at boot dies on its first import, naming a file you never thought of as code:

```bash
Cannot find package 'janux' from '/var/task/janux.config.ts'
```

So `janux-vercel` resolves the app at **build** time. It generates a module that imports every one of those files statically — a bundler can see through those — captures the resolved config as data, and bundles the result into one self-contained file:

```ts title=".janux/app.ts (generated)" {6,10,11}
import { join } from 'node:path';
import type { VercelApp } from '@janux/vercel';
import * as m0 from '../src/routes/index';
import * as m1 from '../src/routes/docs/[section]/[slug]';

const root = join(import.meta.dir, '..');
const path = (file: string) => join(root, file);

const app: VercelApp = {
  root,
  config: { root, routesDir: path('src/routes') /* … */ },
  modules: { [path('src/routes/index.tsx')]: m0 /* … */ },
};

export default app;
```

`prodServerOptions` takes that as a prebuilt app, so the wiring is the same one `janux start` uses — nothing is resolved at runtime, and there is no second code path to keep honest. Every path is rebuilt from the module's own location, because the build machine's `/vercel/path0/…` is not the runtime's `/var/task/…`.

### Two things bundling changes about your app

**Data files.** A module that finds its own files with `import.meta.dirname` gets the *bundle's* directory once bundled. The adapter publishes the app root before importing the app, so read that first:

```ts title="src/server/docs.api.ts" {1}
const CONTENT_DIR = join(process.env.JANUX_APP_ROOT ?? join(import.meta.dirname, '../..'), 'content');
```

**Browser-only imports.** Islands lazily import their client code, so a bundler walking the server graph reaches it — including Vite's asset specifiers (`?worker`, `?url`, `?raw`). Only a client build can resolve those, so the adapter stubs them: the code behind them never runs on a server. Anything a *server* path imports is bundled normally.

> **Note:** the bundle is the whole app, including whatever your islands pull in — this site's is 12 MB because the playground carries Monaco. Well under Vercel's 250 MB limit, and worth knowing when you read a cold start.

## Static export instead

An app with `output: 'static'` has no runtime to choose:

```json title="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bun run build && bunx janux-vercel",
  "cleanUrls": true
}
```

The adapter writes the same output directory with `static/` and no function at all: `janux build` prerendered every page, and the CDN serves the folder. Remember what a static export drops — everything under `/_janux/*`, so no `api()` endpoints, no manifest, no copilot ([details](/docs/recipes/deploying)).

## Deploying

```bash
bunx vercel deploy --prod
```

In a monorepo, set the project's **Root Directory** to the app (`apps/docs` here) so the install runs at the workspace root and `workspace:*` dependencies resolve. Everything else comes from `vercel.json`, and `bun install` is what Vercel already runs for a Bun lockfile.

> **Note:** a CLI deployment is attributed to your **git commit author**. If that email is not on the Vercel team, the deployment is created and immediately blocked — *"Git author … must have access to the team"* — for a build that never started. Check `git config user.email` first.

## Server, not serverless-shaped

The function is a whole app booting on a cold start, not a route handler, and that is deliberate: it is the same server `janux start` runs, so behaviour cannot drift between the platform and your laptop. Two consequences worth knowing:

- **The filesystem is read-only** apart from `/tmp`. `api()` handlers that persist data need a real store — see [auth & context](/docs/recipes/auth-and-context) for where that seam lives.
- **In-memory state is per-instance.** The agent harness keeps proposals and rate-limit counters in memory by default; on a platform that runs many instances, configure the durable storage the harness supports ([agent & copilot](/docs/guide/agent-and-copilot)).

Related: [Deploying](/docs/recipes/deploying) · [Custom server](/docs/recipes/custom-server) · [Docker](/docs/recipes/docker) · [CLI](/docs/reference/cli)
