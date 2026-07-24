# Deploying

A Janux app in production is: **Bun + your source + `dist/client`**. No server bundle, no Node, no Vite at runtime.

## Containers

One stage: install, `bun run build`, `bun run start`. The full Dockerfile — with the `.dockerignore` it needs, a healthcheck that works without `curl`, and measured image sizes — lives in [Docker](/docs/recipes/docker). It runs as-is on Fly.io, Railway, Render, a VPS — anything that runs a container.

## Environment checklist

| Variable | Required? |
|---|---|
| `JANUX_MODEL` or one provider API key | Only if you want the copilot live (without it the agent answers a setup card — the app itself works) |
| `PORT` | Optional, defaults to 3000 |
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
dist/client/llms.txt                          # agent index, when llmsTxt is configured
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

A static export is HTML + islands only. Everything under `/_janux/*` needs the server: `api()` endpoints, the manifest, proposals/approvals and the copilot. If your app uses those, ship a server instead ([Docker](/docs/recipes/docker)) — `output: "static"` is for sites, not apps.

## Scaling notes

- The server is stateless per request **except** pending agent proposals (in-memory, capped at 100). Behind a load balancer, use sticky sessions for the copilot flow — or approve on the same page session, which is the normal UX anyway.
- Static pages are aggressively cacheable: they're plain HTML with no per-user state. Put a CDN in front and cache everything that isn't `/_janux/*`.
- `dist/client` assets are immutable — long cache lifetimes are safe.

> **Warning:** don't expose the manifest of an authenticated app to anonymous users — scope it with `ctxFor` so unauthorized contexts see only what they may call.
