# Deploying to Vercel

Vercel runs functions on Bun, and a Janux server is already the shape that runtime wants — a default export with `fetch`, Web `Request` in, Web `Response` out. `@janux/vercel` is the glue, for both of the framework's outputs: a **Bun server** (SSR, `api()` endpoints, the manifest, MCP, the copilot) or a **static export** (prerendered HTML on the CDN, no runtime).

This site runs on it. [janux.build](https://janux.build) is `apps/docs`, deployed exactly as described here.

## Install and scaffold

```bash
bun add @janux/vercel
bunx janux-vercel --include content --max-duration 60
```

```bash title="what it writes for a server app"
janux-vercel: wrote vercel.json
janux-vercel: wrote api/index.ts
janux-vercel: bundled .janux/server.js (12155 KB)
janux-vercel: ready for `vercel deploy` (output: bun).
```

`vercel.json` and `api/index.ts` are **deployment sources** — Vercel reads the config before running your build — so commit them. The bundle under `.janux/` is build output; ignore it:

```bash title=".gitignore"
.janux/
```

The function itself has nothing in it but the bundle:

```ts title="api/index.ts"
export { default } from '../.janux/server.js';
```

## Why the app is bundled, not shipped

A Janux server imports your app's own source when it boots — routes, layouts, `*.api.ts`, `src/agent.ts`, stores, i18n, middleware — and resolves `janux` from your `node_modules`. That is how `janux start` runs an app with no server bundle at all, and it is the wrong shape for a function twice over:

- **Nothing resolves.** A function has no `node_modules` beside it, so an app resolved at boot dies on its first import, naming a file you never thought of as code: `Cannot find package 'janux' from '/var/task/apps/docs/janux.config.ts'`.
- **Nothing packages.** Vercel's runtimes *trace* dependencies and ship the files they find. In a workspace, `node_modules/janux` is a symlink to `packages/janux`, outside the project — and the deployment is rejected: *"the framework produced an invalid deployment package for a Serverless Function"*.

So `janux-vercel` resolves the app at **build** time. It generates a module that imports every one of those files statically — a bundler can see through those — captures the resolved config as data, and bundles the result into one self-contained file. Nothing is resolved at runtime, and there is nothing left to trace.

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

Every path is rebuilt from the module's own location, because the build machine's `/vercel/path0/…` is not the runtime's `/var/task/…`.

### Two things bundling changes about your app

**Data files.** A module that finds its own files with `import.meta.dirname` gets the *bundle's* directory once bundled. The adapter publishes the app root before importing the app, so read that first:

```ts title="src/server/docs.api.ts" {1}
const CONTENT_DIR = join(process.env.JANUX_APP_ROOT ?? join(import.meta.dirname, '../..'), 'content');
```

**Browser-only imports.** Islands lazily import their client code, so a bundler walking the server graph reaches it — including Vite's asset specifiers (`?worker`, `?url`, `?raw`). Those can only be resolved by a client build, so the adapter stubs them: the code behind them never runs on a server. Anything a *server* path imports is bundled normally.

> **Note:** the bundle is the whole app, including whatever your islands pull in — this site's is 12 MB because the playground carries Monaco. It is well under Vercel's 250 MB limit, and it is worth knowing when you read a cold start.

## What the generated config says

```json title="vercel.json" {5,8,12}
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bunx janux-vercel && bun run build",
  "outputDirectory": "dist/client",
  "bunVersion": "1.x",
  "functions": {
    "api/index.ts": {
      "includeFiles": "{src,dist,content}/**",
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index" }
  ]
}
```

- **`buildCommand`** runs the adapter first: the bundle is regenerated on every deployment, from that deployment's routes.
- **`bunVersion`** puts the whole deployment on Bun — the runtime Janux targets, so the server you tested locally is the server that runs.
- **`includeFiles`** carries what the bundle does not: `src` (the router still reads the routes tree from disk), `dist` (the built stylesheet and `client.js`), and whatever else your app reads — `--include content` for this site, whose pages *are* files. Without it the function deploys and every page 404s.
- **`maxDuration`** raises the function's ceiling; a streaming copilot wants it.
- **The rewrite runs last.** Vercel serves `outputDirectory` from its CDN first, so `client.js`, the stylesheet and everything in `public/` never wake the function; only what the CDN could not answer does.

## Static export instead

An app with `output: 'static'` has no runtime to configure:

```json title="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bunx janux-vercel && bun run build",
  "outputDirectory": "dist/client",
  "cleanUrls": true
}
```

No function, no `bunVersion`, no bundle: `janux build` prerendered every page and Vercel serves the folder. Remember what a static export drops — everything under `/_janux/*`, so no `api()` endpoints, no manifest, no copilot ([details](/docs/recipes/deploying)).

## Deploying

```bash
bunx vercel deploy --prod
```

In a monorepo, set the project's **Root Directory** to the app (`apps/docs` here) so the install runs at the workspace root and `workspace:*` dependencies resolve. Everything else is zero-config: the build command comes from `vercel.json`, and `bun install` is what Vercel already runs for a Bun lockfile.

> **Note:** a CLI deployment is attributed to your **git commit author**. If that email is not on the Vercel team, the deployment is created and immediately blocked — *"Git author … must have access to the team"* — for a build that never started. Check `git config user.email` first.

## Server, not serverless-shaped

The function is a whole app booting on a cold start, not a route handler, and that is deliberate: it is the same server `janux start` runs, so behaviour cannot drift between the platform and your laptop. Two consequences worth knowing:

- **The filesystem is read-only** apart from `/tmp`. `api()` handlers that persist data need a real store — see [auth & context](/docs/recipes/auth-and-context) for where that seam lives.
- **In-memory state is per-instance.** The agent harness keeps proposals and rate-limit counters in memory by default; on a platform that runs many instances, configure the durable storage the harness supports ([agent & copilot](/docs/guide/agent-and-copilot)).

Related: [Deploying](/docs/recipes/deploying) · [Custom server](/docs/recipes/custom-server) · [Docker](/docs/recipes/docker) · [CLI](/docs/reference/cli)
