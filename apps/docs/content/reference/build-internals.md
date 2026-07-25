# Build & CLI internals

The plumbing the [CLI](/docs/reference/cli) and the [Vite plugin](/docs/guide/cli-and-deployment) use. You need this page to embed Janux in another build, to write a custom server, or to script the CLI — not to build an app.

```ts
import { resolveAppConfig, shellOptions, apiFiles, apiStubModule, exportedApiNames, apiModuleName, toFetchRequest, sendFetchResponse } from '@janux/vite';
import { runCli, parseArgs, HELP_TEXT } from '@janux/cli';
import { createHttpHandlers } from '@janux/server';
import { renderNode } from 'janux/server';
```

## resolveAppConfig(root, pluginOptions?)

`resolveAppConfig(root: string, options?): Promise<JanuxAppConfig>` resolves the conventional layout — every optional path in [project structure](/docs/getting-started/project-structure) — into absolute paths. Precedence, lowest to highest:

1. the `"janux"` field in `package.json` (deprecated fallback),
2. `janux.config.ts` / `.js` default export,
3. options passed to the plugin.

Config files are imported with an **mtime cache-buster**, which is why editing `janux.config.ts` takes effect in dev without restarting. Discovery is by existence: `src/middleware.ts`, `src/matchers.ts`, `src/i18n.ts` (or `src/i18n/index.ts`), `src/api/`, `src/stores.ts`, `src/agent.ts`, `src/styles.css`, `public/favicon.svg`.

## shellOptions(app, stylesheets)

`shellOptions(app: JanuxAppConfig, stylesheets: string[])` maps a resolved app config onto the `ServerOptions` fields the [HTML shell](/docs/guide/ssr-and-resumability) reads — `title`, `lang`, `favicon` — and passes the stylesheet URLs through. Dev and production build the same shell from the same config, so they share this mapping instead of each listing the fields:

```ts
// dev: Vite serves the stylesheet with its own URL contract
{ ...shellOptions(app, devStylesheets(root, app.stylesheet)) }
// production: the bundler emitted /styles.css
{ ...shellOptions(app, app.stylesheet ? ['/styles.css'] : []) }
```

The stylesheet URL is the one field that legitimately differs between the two, which is why it's a parameter. Everything else being shared is the point: the favicon was once wired in dev and forgotten in production, so every build shipped a shell with no icon link and browsers fell back to a 404 `/favicon.ico`.

## The app stylesheet

`src/styles.css` is always a bundler input (`bundleInputs`), so `janux build` emits it through Vite as `dist/client/styles.css` — the same pipeline dev serves it with. That means `@import` of a dependency's CSS resolves in production too:

```css
/* src/styles.css */
@import '@xyflow/react/dist/style.css';
```

It used to be copied verbatim unless `@janux/tailwind` was installed, so anything only the bundler could resolve — bare specifiers, `url()` assets — shipped as literal text that 404'd in the browser.

## The api() stub pipeline

A `*.api.ts` module runs on the server; the client gets a tiny typed stub instead of the implementation. Three functions do that:

| Function | Does |
|---|---|
| `apiFiles(serverDir)` | Lists `*.api.ts` / `*.api.js` in the server dir (empty array when it doesn't exist) |
| `exportedApiNames(source)` | Parses a module's exported `api()` names — via SWC, without executing it |
| `apiStubModule(names, moduleName)` | Generates the client module: one `clientApi()` stub per name |
| `apiModuleName(file)` | The stable module id a stub is addressed by |

The parse-don't-execute step is the important one: server-only imports (a database driver, secrets) never reach the client graph, because the plugin never runs the module to learn its exports.

## Node ⇄ Web request adapters

```ts
const request = toFetchRequest(nodeReq);          // IncomingMessage → Request
await sendFetchResponse(nodeRes, response);       // Response → ServerResponse
```

These bridge Vite's Node middleware to Janux's Fetch-API handlers, and they're what you want when mounting Janux inside an Express/Connect app.

## createHttpHandlers(options)

Builds the router for `src/api/**` — the [HTTP handlers](/docs/guide/http-handlers) feature — dispatching on exported method names (`export function POST`) and handling uploads. Import it when you assemble a server yourself instead of using `createJanuxServer`.

## renderNode(node, scope)

The lower-level renderer under [`renderToString`](/docs/reference/core-api): renders one node against a render scope and returns HTML. Use `renderToString` unless you're building a renderer — it's what gives you `snapshots`, `registry` and `i18nKeys` alongside the HTML.

## Scripting the CLI

```ts
await runCli(['build']);                    // same as `janux build`
const parsed = parseArgs(['eval', 'evals/a.eval.json', '--json'], process.cwd());
console.log(HELP_TEXT);
```

`runCli(argv)` dispatches to the commands and falls back to printing `HELP_TEXT` for anything unknown. `parseArgs(argv, cwd)` resolves the command, the port (`--port`, then `PORT`, then `3000`, throwing on a non-number) and command flags — handy in a test or a monorepo task runner that wants the parsed shape without spawning a process.

Related: [CLI reference](/docs/reference/cli) · [CLI and deployment](/docs/guide/cli-and-deployment) · [Project structure](/docs/getting-started/project-structure)
