---
title: Deploying
description: "A Janux app in production is a Request → Response function plus dist/client. Which runtime calls it — Bun, Node 24+, Vercel, or none at all — is a build-time choice."
---

# Deploying

A Janux app in production is a **`Request → Response` function plus `dist/client`**. Which runtime calls that function is a build-time choice — an *adapter* — and nothing in `src/` depends on it.

## Adapters

| Target | Adapter | Command | WebSockets | Streaming | Filesystem | Schedules |
|---|---|---|---|---|---|---|
| **Bun** | built in | `bun run build && bun run start` | ✅ | ✅ | ✅ | ✅ in-process |
| **Node 24+** | `@janux/node` | `bun run build && bunx janux-node` → `node build/index.js` | ✅ | ✅ | ✅ | ✅ in-process |
| **Vercel** | `@janux/vercel` | `bun run build && bunx janux-vercel` | ❌ serverless | ✅ | ✅ `/tmp` | ⏱ platform cron |
| **Any static host** | `output: "static"` | `bun run build` → upload `dist/client` | ❌ | — | ❌ | ❌ |
| Cloudflare, Netlify, Deno | *not shipped* | [write one](/docs/recipes/adapters) | — | — | — | — |

Bun and Node are full parity: same app, same features, different `node_modules`. Vercel trades WebSockets for a CDN and zero servers. `output: "static"` gives up the server entirely.

The schedules column is the one that is not a simple yes/no. A persistent process ticks [`src/schedules/`](/docs/reference/agent-schedules) itself; a serverless target has no process to tick with, so the platform's cron calls `/_janux/schedules/tick` instead (Vercel with a `GET`) and `JANUX_CRON_SECRET` — or Vercel's own `CRON_SECRET` — gates it. Same schedules, same store, different trigger — the adapter declares which, and the difference is not hidden from you.

A ❌ is not something you discover in production: an adapter *declares* what it supports, and `janux build` prints the app features a missing capability disables.

### Node

The one people ask for first, because it means no Bun on the box:

```bash
bun add @janux/node    # the adapter is a dependency of the app, like @janux/vercel
bun run build          # the client bundle — Vite, as always
bunx janux-node        # → build/
node build/index.js    # PORT=3000 by default
```

`build/` is self-contained — copy that directory anywhere with Node 24+ and run it. There is no install step, because there is nothing left to resolve:

```
build/index.js          # the launcher
build/.janux/index.js   # the bundled server: every app module inlined
build/dist/client/      # client bundle + stylesheet, served with cache headers and brotli
build/src/              # the app's source — the router reads it to learn which URLs exist
build/package.json      # {"type":"module"}
```

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY build ./
ENV PORT=3000
CMD ["node", "index.js"]
```

Apps that read their own files at runtime pass them along: `bunx janux-node --include content`.

`src/ws.ts` works here and nowhere else among the shipped adapters: the `ws` implementation is bundled in, so a WebSocket app stays as install-free as any other.

> **Note:** the **build** still runs under Bun — Vite, `@swc/core` and the bundler are build tooling. What Node has to run is the output. A CI image with Bun and a production image with Node is the intended shape, and the two never have to be the same machine.

Working example: [`examples/with-node-adapter`](https://github.com/aralroca/Janux/tree/main/examples/with-node-adapter).

### Bun

The default, and still the shortest path: `janux start` serves `dist/client` and the app from one process, WebSockets included. One stage — install, `bun run build`, `bun run start`. The full Dockerfile, with the `.dockerignore` it needs, a healthcheck that works without `curl`, and measured image sizes, lives in [Docker](/docs/recipes/docker). It runs as-is on Fly.io, Railway, Render, a VPS — anything that runs a container.

### Vercel

[Vercel](/docs/recipes/vercel) has its own page: the adapter writes a Build Output API directory, so the platform builds nothing and traces nothing.

### Something else

The adapter API is public and documented: [Writing an adapter](/docs/recipes/adapters) is enough to target Cloudflare, Netlify, Deno or your own infrastructure without reading Janux's source. The runtime contract is one function, and every platform above already speaks it.

## Environment checklist

| Variable | Required? |
|---|---|
| `JANUX_MODEL` or one provider API key | Only if you want the copilot live (without it the agent answers a setup card — the app itself works) |
| `PORT` | Optional, defaults to 3000 |
| `HOST` | Optional; `@janux/node` binds every interface without it |
| Your own secrets (DB urls, etc.) | Read them in `ctxFor` / api modules as usual |

## What to check after deploy

```bash
curl -s https://your.app/                       # SSR HTML; static pages: zero <script>
curl -s https://your.app/_janux/manifest        # the agent surface is up
curl -s -X POST https://your.app/_janux/agent \
  -H 'content-type: application/json' -d '{"messages":[]}'   # text/setup, not 500
```

## Static export (`output: "static"`)

For sites whose pages don't depend on per-request state — documentation, marketing, blogs — you can skip the server entirely:

```ts
// janux.config.ts
import { defineConfig } from 'janux';

export default defineConfig({ output: 'static' });
```

Now `janux build` also prerenders every page into `dist/client`:

```
dist/client/index.html                        # /
dist/client/docs/guide/getting-started/index.html
dist/client/docs/guide/getting-started.md     # markdown projection of each page (`/` → `.md`)
dist/client/404.html                          # src/routes/_404.tsx, when the app has one
dist/client/llms.txt                          # agent index, when llmsTxt is configured
dist/client/sitemap.xml, robots.txt           # when siteUrl is configured
dist/client/client.js, styles.css, ...        # islands still hydrate on interaction
```

Upload `dist/client` to any static host (GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket) — no Bun, no Node, no server.

### Dynamic routes need `staticParams`

A file like `routes/docs/[section]/[slug].tsx` matches infinitely many URLs, so the build can't know which pages exist. Export `staticParams` to enumerate them — an array of param records, or a sync/async function returning one (resolved like `meta`):

```tsx
// routes/docs/[section]/[slug].tsx
export function staticParams() {
  return docIndex().map(({ section, slug }) => ({ section, slug }));
}

export default function DocPage({ params }) { ... }
```

Every record becomes a prerendered page (`{ section: 'guide', slug: 'getting-started' }` → `/docs/guide/getting-started`). Dynamic routes **without** `staticParams` are skipped with a build warning. The export also improves server apps: `llms.txt` lists the concrete pages instead of the raw `/docs/[section]/[slug]` pattern, so agents can navigate directly.

### What you give up

A static export is HTML + islands only. Everything under `/_janux/*` needs the server: `api()` endpoints, the manifest, proposals/approvals and the copilot. If your app uses those, ship a server instead — Bun, Node or Vercel above — `output: "static"` is for sites, not apps.

## Scaling notes

- The server is stateless per request **except** pending agent proposals (in-memory, capped at 100). Behind a load balancer, use sticky sessions for the copilot flow — or approve on the same page session, which is the normal UX anyway.
- Static pages are aggressively cacheable: they're plain HTML with no per-user state. Put a CDN in front and cache everything that isn't `/_janux/*`.
- `dist/client` assets are immutable — long cache lifetimes are safe.

> **Warning:** don't expose the manifest of an authenticated app to anonymous users — scope it with `ctxFor` so unauthorized contexts see only what they may call.
