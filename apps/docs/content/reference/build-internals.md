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

`shellOptions(app: JanuxAppConfig, stylesheets: string[])` maps a resolved app config onto the `ServerOptions` fields the [HTML shell](/docs/guide/ssr-and-resumability) reads — `title`, `lang`, `siteUrl`, `favicon` — and passes the stylesheet URLs through. Dev and production build the same shell from the same config, so they share this mapping instead of each listing the fields:

```ts
// dev: Vite serves the stylesheet with its own URL contract
{ ...shellOptions(app, devStylesheets(root, app.stylesheet)) }
// production: the bundler emitted /styles.css — unless it is being inlined
{ ...shellOptions(app, app.stylesheet && !inlineStyles ? ['/styles.css'] : []), inlineStyles }
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

## The image optimizer

One optimizer, used from both ends of an app's life — the build-time half of the [images guide](/docs/guide/images):

| Function | Does |
|---|---|
| `writeImageVariants(root, outDir)` | Walks `<root>/public`, encodes every ladder width in AVIF and WebP, and writes them under `outDir/_janux/image/`. Returns how many sources it processed. Called by `janux build`, whatever the `output` |
| `imageResponse(root, pathname)` | Encodes one variant on demand for `janux dev`, or `undefined` when the path is not one `<Image>` would have emitted |

Neither asks the other what exists: both derive URLs from `janux`'s pure `variantUrl` / `parseVariantUrl`, which is what keeps `janux dev`, `janux start` and `output: 'static'` picking from the same candidates.

## The font resolver

The build-time half of the [font pipeline](/docs/guide/fonts). Everything is cached under `node_modules/.janux/fonts`, so the network is touched once per font and never again.

| Function | Does |
|---|---|
| `resolveFonts(root, configs)` | Fetches the Google stylesheet, keeps the declared subsets/weights, self-hosts each `woff2` and measures the real file — returns the `ResolvedFont[]` the CSS layer formats |
| `writeFontAssets(root, configs, outDir)` | The build's output: the files, the finished CSS and the preload list, written under `outDir/_janux/font/` |
| `builtFontAssets(outDir)` | Reads those back for `janux start` and `output: 'static'` — neither resolves anything |
| `fontResponse(root, path)` | Serves one file out of the cache under `janux dev`, where there is no build output yet |

## Node ⇄ Web request adapters

```ts
const request = toFetchRequest(nodeReq);          // IncomingMessage → Request
await sendFetchResponse(nodeRes, response);       // Response → ServerResponse
```

These bridge Vite's Node middleware to Janux's Fetch-API handlers, and they're what you want when mounting Janux inside an Express/Connect app.

## createHttpHandlers(options)

Builds the router for `src/api/**` — the [HTTP handlers](/docs/guide/http-handlers) feature — dispatching on exported method names (`export function POST`) and handling uploads. Import it when you assemble a server yourself instead of using `createJanuxServer`.

## Upload guards

The body-limit and content-sniffing helpers handlers validate uploads with (see [HTTP handlers & uploads](/docs/guide/http-handlers) for the full recipe):

```ts
import { formDataWithin, matchesType, readBodyWithin, rejectOversized, sniffContentType } from '@janux/server';

rejectOversized(req, maxBytes);          // null | 413 Response — content-length checked before any body byte
await readBodyWithin(req, maxBytes);     // Uint8Array | 413 Response — chunked bodies cut at the limit
await formDataWithin(req, maxBytes);     // FormData | 413 Response — multipart under the same protection
sniffContentType(bytes);                 // 'image/png' | … | undefined, from magic bytes
await matchesType(file, ['image/*']);    // the file's real bytes against MIME patterns
acceptsType(type, ['image/*']);          // an already-known type against those patterns — undefined never matches
```

## spoolMultipart(req, options)

The streaming sibling of `formDataWithin`: parses `multipart/form-data` as it arrives and spools every file part to a per-request temp directory, so memory stays flat whatever the upload weighs. `SpoolOptions` is `{ maxBytes, dir? }` (`dir` defaults to the OS temp dir).

```ts
import { spoolMultipart, type SpooledFile, type SpooledForm } from '@janux/server';

// A `Response` instead of the form means 413 (over the limit) or 400 (malformed).
const result = await spoolMultipart(req, { maxBytes: 4 * 1024 ** 3 });
const form = result as SpooledForm;
const file: SpooledFile | undefined = form.file('video');

file?.field; // the multipart field name
file?.name; // the client-supplied filename — never a safe path
file?.type; // the declared content-type
file?.sniffed; // what the first bytes really are, read as they streamed
file?.size; // bytes on disk
file?.path; // where they landed, until moveTo() or cleanup()
await file?.moveTo('/var/uploads/clip.mp4'); // rename, or copy across filesystems
form.fields.title; // non-file parts, UTF-8, capped at 1 MB each
await form.cleanup(); // removes whatever moveTo() did not claim
```

Nothing is spooled when the request is refused: an oversized or malformed body takes the temp directory with it before the `Response` returns. A `SpooledForm` you keep is yours to `cleanup()`.

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
