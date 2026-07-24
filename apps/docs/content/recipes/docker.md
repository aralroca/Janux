# Docker

A Janux app in a container is **Bun + your source + `dist/client`**. There is no server bundle to produce, so there is nothing to copy between stages: one stage installs, builds the client assets and runs `janux start`.

```dockerfile
FROM oven/bun:1.3-slim
WORKDIR /app

# Deps first: this layer is cached until package.json or the lockfile changes.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "run", "start"]
```

```bash
docker build -t my-app .
docker run -p 3000:3000 my-app
```

## `.dockerignore` is part of the recipe

`COPY . .` happens *after* `bun install`, so without this file you copy your host's `node_modules` on top of the container's:

```
node_modules
dist
.git
*.log
```

It still builds — Bun keeps the platform binary it installed — but the image carries your machine's dead weight. Measured on the starter app: **425 MB with the file, 523 MB without it** (98 MB of macOS binaries that can never run there).

## What ends up in the image

| What | Detail |
|---|---|
| Size (starter app) | ~425 MB — mostly the Bun runtime and `node_modules` |
| Build toolchain | **stays**: Vite, Rollup and esbuild are dependencies of `@janux/cli`, and `janux start` is that CLI |
| `curl` / `wget` | **absent** from `oven/bun:*-slim` — see the healthcheck below |
| Your TSX | shipped as source: `janux start` runs it on Bun, there is no server build step |

`bun install --production` works and is safe — `janux`, `@janux/server` and `@janux/cli` are runtime dependencies in the scaffolded app, not dev ones. It just doesn't save much, and neither does a multi-stage build: a builder stage plus a `--production` runtime stage measured **421 MB against the single stage's 425 MB**. The toolchain isn't build-only here, so there is nothing to leave behind. Skip the complexity.

## Healthcheck without curl

The slim image has no HTTP client on `PATH`, so a `CMD curl -f` healthcheck fails 100% of the time. Bun is the HTTP client:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD bun -e 'const r = await fetch(`http://localhost:${process.env.PORT ?? 3000}/`); process.exit(r.ok ? 0 : 1)'
```

## Ports

`ENV PORT=3000` sets the default; the server reads `PORT` at boot, so the runtime wins:

```bash
docker run -e PORT=4000 -p 8080:4000 my-app     # server listens on 4000
```

## Environment

| Variable | Effect if absent |
|---|---|
| `JANUX_MODEL` or a provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) | The app works and `/_janux/agent` answers `200` with a setup card — only the copilot's model is missing |
| `PORT` | Defaults to 3000 |
| Your own secrets | Read them in `ctxFor` or in `api()` modules, as usual |

## Verify the container, not just the build

```bash
curl -s localhost:3000/                       # SSR HTML with <janux-island> markers
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/client.js   # 200: the build landed
curl -s 'localhost:3000/_janux/manifest?path=/'                     # the agent surface is up
curl -s -X POST localhost:3000/_janux/agent \
  -H 'content-type: application/json' -d '{"messages":[]}'          # 200, even with no model key
```

A `200` on `/` with a `404` on `/client.js` means `bun run build` didn't run (or `dist/client` was ignored *after* the build): the page renders, the islands never wake up.

## Compose

```yaml
services:
  web:
    build: .
    ports: ['3000:3000']
    environment:
      PORT: 3000
      JANUX_MODEL: ${JANUX_MODEL}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    healthcheck:
      test: ['CMD', 'bun', '-e', 'process.exit((await fetch("http://localhost:3000/")).ok ? 0 : 1)']
      interval: 30s
```

## Static apps don't need any of this

With `output: 'static'` there is no server at request time: `janux build` prerenders the pages and you upload `dist/client`. See [deploying](/docs/recipes/deploying).

Related: [Deploying](/docs/recipes/deploying) · [Custom server](/docs/recipes/custom-server) · [CLI](/docs/reference/cli)
