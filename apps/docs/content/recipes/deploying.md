# Deploying

A Janux app in production is: **Bun + your source + `dist/client`**. No server bundle, no Node, no Vite at runtime.

## Dockerfile

```bash
FROM oven/bun:1.3-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY . .
RUN bun run build          # client.js + styles.css + public/ → dist/client
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "start"]
```

Works as-is on Fly.io, Railway, Render, a VPS — anything that runs a container.

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

## Scaling notes

- The server is stateless per request **except** pending agent proposals (in-memory, capped at 100). Behind a load balancer, use sticky sessions for the copilot flow — or approve on the same page session, which is the normal UX anyway.
- Static pages are aggressively cacheable: they're plain HTML with no per-user state. Put a CDN in front and cache everything that isn't `/_janux/*`.
- `dist/client` assets are immutable — long cache lifetimes are safe.

> **Warning:** don't expose the manifest of an authenticated app to anonymous users — scope it with `ctxFor` so unauthorized contexts see only what they may call.
