# Deploying to Node with `@janux/node`

The same Janux app, served by Node instead of Bun. Nothing in `src/` mentions either one — the runtime is a build-time choice:

- **One adapter, one command** — `janux build` produces the client, `janux-node` turns it into a `build/` directory. `node build/index.js` serves it.
- **Nothing to install on the box** — `build/` holds the bundled server, the client assets and the app's source tree. No `node_modules`, no install step, because there is nothing left to resolve.
- **The whole app survives the move** — SSR, island hydration, `api()` RPC, the agent manifest and the CSRF guard on the invocation pipeline all work exactly as they do under Bun. The page proves it: the click counter only moves if the island hydrated from the bundle Node served.
- **Node 24+** — the adapter declares it, and `@janux/node` uses no API newer than that.

```bash
bun install

bun run dev                          # http://localhost:4321 — normal Bun dev loop
bun run build && bun run start       # production on Bun

bun run build:node                   # → build/
node build/index.js                  # production on Node (PORT=3000 by default)
```

## What `build/` contains

```
build/index.js          # the launcher you run
build/.janux/index.js   # the bundled server — every app module inlined
build/dist/client/      # the client bundle and stylesheet, served with cache headers + brotli
build/src/              # the app's source: the router reads it to learn which URLs exist
build/package.json      # {"type":"module"} — without it Node reads the bundle as CommonJS
```

Copy that directory to any box with Node 24+ and run it. A container is the same idea:

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY build ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
```

## Checking a deployment from outside the browser

`whoami` is an `api()` endpoint, which means it is also an agent tool — so the same question can be asked over HTTP or through the manifest:

```bash
curl -s -X POST localhost:3000/_janux/api/runtime.whoami \
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' -d '{}'
# {"ok":true,"result":{"runtime":"Node","version":"24.…"}}

curl -s 'localhost:3000/_janux/manifest?path=%2F'
```

## Choosing a different target

`@janux/node` is one implementation of the adapter API. Writing one for another platform is documented in [Adapters](../../apps/docs/content/recipes/adapters.md); the shipped targets and what each supports are in [Deploying](../../apps/docs/content/recipes/deploying.md).
