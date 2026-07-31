---
title: Writing an adapter
description: The two halves of the Janux adapter contract — a build hook and a Request → Response handler — with a complete worked example, so you can target a platform Janux does not ship.
---

# Writing an adapter

An adapter teaches Janux to deploy somewhere. Janux ships four targets ([Deploying](/docs/recipes/deploying) has the matrix); this page is how you write a fifth, without reading the framework's source.

There are exactly two halves, and everything else follows from them:

| Half | What it is | Who calls it |
|---|---|---|
| **Build** | `adapt(builder)` — turns what `janux build` produced into what the platform wants | `janux build`, then your CLI |
| **Runtime** | `fetch(request): Promise<Response>` | the platform, per request |

The runtime half is why adapters stay small. A Janux server *is* a function from a `Request` to a `Response`, and that is the entry point every modern target already takes:

```js
// Bun
Bun.serve({ fetch: handler.fetch });
// Deno
Deno.serve(handler.fetch);
// Cloudflare Workers, Netlify Functions, Vercel
export default { fetch: handler.fetch };
```

Node is the exception — it predates both types — which is why `@janux/node` carries an HTTP bridge and the others do not.

## The interface

```ts
import type { JanuxAdapter } from '@janux/cli/adapter';

export function myPlatform(): JanuxAdapter {
  return {
    name: '@acme/janux-myplatform',
    capabilities: { websocket: false, streaming: true, filesystem: false },
    async adapt(builder) {
      await builder.writeEntry({
        imports: ["import { createRequestHandler } from '@janux/cli/adapter';"],
        body: 'export default createRequestHandler(app);',
      });
      await builder.bundle('.myplatform/server.js', 'node');
      builder.copyDir('src', '.myplatform/src');
      builder.copyClient('.myplatform/static');
    },
  };
}
```

That is a complete adapter. Run it with `runAdapter`, which resolves the app and hands you the builder:

```ts
import { runAdapter } from '@janux/cli/adapter/build';

await runAdapter(myPlatform(), process.cwd());
```

## `capabilities` — say what the platform cannot do

Every flag is declared, never detected. Janux cannot test whether your platform holds a socket open, and an app that finds out in production has found out too late.

| Flag | True when the platform… | What a `false` costs the app |
|---|---|---|
| `websocket` | can hold a connection open for its lifetime | `src/ws.ts` does not work |
| `streaming` | can send a body in chunks | streaming SSR and `<Suspense>` arrive all at once, at the end |
| `filesystem` | has a writable disk while serving | `spoolMultipart()` cannot spool uploads |

`unsupportedFeatures()` turns the flags plus the app's own shape into the list worth printing — it stays quiet about WebSockets for an app that has none:

```ts
import { unsupportedFeatures } from '@janux/cli/adapter';

unsupportedFeatures(builder.config, capabilities).forEach((gap) => builder.log(`unsupported — ${gap}`));
```

## `AdapterBuilder` — everything you are handed

```ts
interface AdapterBuilder {
  root: string;                    // the app root on the build machine
  config: JanuxAppConfig;          // resolved conventions: routesDir, serverDir, agentModule, i18n, output…
  clientDir: string;               // <root>/dist/client — what `janux build` emitted

  writeEntry(entry: AdapterEntry): Promise<void>;
  bundle(outfile: string, target: 'node' | 'bun'): Promise<number>;   // → bytes
  copyClient(to: string): void;
  copyDir(from: string, to: string): boolean;                        // → was it there?
  write(path: string, contents: string): Promise<void>;
  log(message: string): void;
}
```

Every path is relative to `root`.

### `writeEntry` — the generated module, and why it exists

A Janux server normally imports the app's own source when it boots. A deployment cannot: there is no `node_modules` beside it to resolve `janux` from, so the very first import fails.

`writeEntry` therefore generates `.janux/app.ts` — every module the server would have imported, imported **statically**, so a bundler inlines them — and `.janux/entry.ts` around it:

```ts
// what you write
await builder.writeEntry({
  imports: ["import { serve } from '@acme/janux-myplatform';"],
  body: 'await serve(app);',
});
```

```ts
// .janux/entry.ts — what gets bundled
import { join } from 'node:path';
import { serve } from '@acme/janux-myplatform';

process.env.JANUX_APP_ROOT = join(import.meta.dirname, '..');
const { default: app } = await import('./app');

await serve(app);
```

Two details are load-bearing:

- **`imports` are hoisted.** ESM runs them before anything else, so they must not read `JANUX_APP_ROOT`. Your own package is fine; the app is not.
- **The app is imported dynamically**, after `JANUX_APP_ROOT` is set. App code that locates its own data files (`join(import.meta.dirname, '../content')`) does it at import time, and inside a bundle `import.meta.dirname` is the bundle's directory — not the source file's.

`app` is a `JanuxApp`: `{ root, config, modules }`. `root` is the app root **as the running deployment sees it**, derived from the bundle's own location — never the build machine's path.

### The deployment's root is the bundle's parent

`app.root` resolves to the directory *above* the bundle. That one line decides your layout:

```
.myplatform/            ← app.root at runtime
  server.js             ← the bundle you wrote to `.myplatform/server.js`
```

Put the bundle one level inside the directory you ship, and that directory becomes the deployment root.

### `copyDir('src', …)` is not optional

The bundle inlines every route *module*, but the router still reads the routes directory to learn **which URLs exist**. Ship `src/` or the app answers nothing. Both shipped server adapters do this, and so should yours.

Anything else the app reads at runtime — `content/`, `data/` — is the same class of thing, which is why `@janux/node` and `@janux/vercel` both take `--include`.

## The runtime half

```ts
import { createRequestHandler } from '@janux/cli/adapter';

const handler = createRequestHandler(app);       // { fetch(request): Promise<Response> }
```

It boots the app **once per instance**, not once per request — a cold start pays for the whole app, and every request after it is free.

If your platform serves static assets itself (a CDN in front, as on Vercel), that is all you need. If your process owns the socket, put the built client in front:

```ts
import { createRequestHandler, staticResponse } from '@janux/cli/adapter';

const handler = createRequestHandler(app);
const clientDir = join(app.root, 'dist/client');

async function fetch(request: Request): Promise<Response> {
  return (await staticResponse(clientDir, request)) ?? handler.fetch(request);
}
```

`staticResponse` handles content types, immutable caching for hashed filenames, and brotli/gzip compressed once per file rather than once per request. It returns `undefined` when the path is not a built asset, which is the `??` above.

> **Warning:** the client must end up at `dist/client` **inside the deployment root**. The server decides whether to emit the client runtime script by looking for `dist/client/client.js` under `app.root` — put it anywhere else and every page renders perfectly and never hydrates.

## A complete adapter: Deno

Deno takes `Request → Response` natively and has a filesystem, so the whole adapter is the build half plus four lines of entry:

```ts
import type { JanuxAdapter } from '@janux/cli/adapter';

const OUT = 'deno-deploy';

export function deno(): JanuxAdapter {
  return {
    name: '@acme/janux-deno',
    // Deno Deploy runs a long-lived isolate with a writable /tmp.
    capabilities: { websocket: true, streaming: true, filesystem: true },

    async adapt(builder) {
      await builder.writeEntry({
        imports: [
          "import { join } from 'node:path';",
          "import { createRequestHandler, staticResponse } from '@janux/cli/adapter';",
        ],
        body: [
          'const handler = createRequestHandler(app);',
          "const clientDir = join(app.root, 'dist/client');",
          'Deno.serve(async (request) => (await staticResponse(clientDir, request)) ?? handler.fetch(request));',
        ].join('\n'),
      });

      const bytes = await builder.bundle(`${OUT}/.janux/server.js`, 'node');

      builder.copyClient(`${OUT}/dist/client`);
      builder.copyDir('src', `${OUT}/src`);
      await builder.write(`${OUT}/index.js`, "import './.janux/server.js';\n");
      builder.log(`bundled ${Math.round(bytes / 1024)} KB → deno run -A ${OUT}/index.js`);
    },
  };
}
```

## Packaging it

Mirror `@janux/node`:

- `dependencies` on `@janux/cli`, `@janux/server` and `@janux/vite`;
- a `bin` that calls `runAdapter`, so users run `bunx janux-myplatform` after `janux build`;
- `engines` naming the runtime version you actually support.

The app installs your adapter as a dependency — the generated entry imports it by name, so it has to resolve at build time.

> **Warning:** anything your runtime code needs must be **statically importable**, or the bundler cannot see it and your output ships an import the deployment cannot resolve. `@janux/node` learned this the hard way: it reached `ws` through a variable specifier (`const M = 'ws'; await import(M)`), the bundle looked fine, every page rendered, and WebSockets died on connect. A test that scans the bundle for any specifier that is neither relative nor `node:` is worth more than it costs.

The build runs under Bun — Vite, SWC and the bundler are build tooling. Only the **runtime** is your platform's, which is the whole point: the machine that builds and the machine that serves do not have to be the same kind of machine.

## Testing it

Two failures matter, and neither shows up in a unit test:

1. **The bundle does not run where it lands.** Copy the output somewhere with no `node_modules` above it and run it there. `@janux/vercel` does exactly this, and it is the test that catches a bare specifier surviving the bundle.
2. **The runtime is not the one your tests run on.** `bun test` gives you Bun. If you are adapting Node or Deno, spawn it — `@janux/node` asserts its disconnect and cookie behaviour by spawning `node`, because Bun's `node:http` shim never emits `close` on a `ServerResponse` and the test would have passed for the wrong reason.
