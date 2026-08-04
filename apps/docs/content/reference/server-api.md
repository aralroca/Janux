---
title: Server API
description: "Everything importable from the server package: the server factory, api() RPC, the file-system router and the framework endpoints it serves."
---

# Server API

Everything importable from `@janux/server`.

## api(def)

```ts
export const pay = api({
  description: 'Charge the cart. Irreversible.',
  input: schema({ total: money() }),
  output: schema({ orderId: str() }),   // validated after run (dev safety net)
  guard: 'confirm',
  scopes: ['orders:write'],             // authorization: absent from the manifest AND refused, out of scope
  run: ({ input, ctx }) => payments.charge(input.total, ctx.userId),
});
```

The returned value is **directly callable on the server** (`await pay({ total: 100 })`) — SSR sources and other apis use it without HTTP. Client bundles swap the whole `*.api.ts` module for fetch stubs at build time (SWC).

Conventions: files live in `src/server/<module>.api.ts`; tool names become `api.<module>.<export>`. Only `export const x = api({...})` is supported — `export default`, `export function` and re-exports fail the build loudly. Names may not contain `__`.

## createJanuxServer(options)

| Option | Type | Notes |
|---|---|---|
| `routesDir` | `string` | File-system routing root (full segment grammar, `_layout` chains, `(group)` dirs) |
| `matchers` | `Record<name, (value) => boolean>` | Custom typed-param matchers for `[param=matcher]` (built-ins: `integer`, `uuid`) |
| `middleware` | `(req) => Response \| undefined` | Runs before routing; a returned Response short-circuits |
| `routes` | `Record<path, renderFn>` | Inline routes (tests, embedding) |
| `loadRoute` | `(filePath) => Promise<module>` | Injectable loader (Vite dev uses `ssrLoadModule`) |
| `apis` | `Record<module, moduleExports>` | api() modules |
| `storeDefs` | `Record<alias, StoreDef>` | Stores available during SSR |
| `agent` | `AgentMount` | Mounted at `/_janux/agent` |
| `ctxFor` | `(req, { session, agent }) => Ctx` | Auth: builds the per-request context. The bag carries what the framework already verified — the session cookie's payload and the Web Bot Auth identity |
| `session` | `SessionStore` | Signed session cookies (`createSessionStore`); the server reads them and carries a rotated cookie out on the response |
| `llmsTxt` | `{ title?, description? }` | Opt-in: serves `GET /llms.txt` — pages + agent tools index (`confirm` tools annotated "requires human approval"; dynamic routes expanded via `staticParams`) |
| `agents` | `{ webBotAuth: { keys }, policy? }` | Web Bot Auth agent identity — see below |
| `websocket` | `{ path, data?, open?, message?, close?, drain? }` | First-class WebSocket endpoint (`WebSocketConfig`): `janux dev`/`janux start` upgrade `path` themselves; a custom `Bun.serve` uses the returned `serve(req, bunServer)` + `websocket` handlers — see [custom server](/docs/recipes/custom-server). The pure `fetch` answers `426` on `path` |
| `mcpAuth` | `{ verify(token, req), resourceMetadataUrl? }` | Bearer verification for `POST /_janux/mcp` (`401` + `WWW-Authenticate` otherwise; the GET landing stays public and prints `$TOKEN`-placeholder connect commands). Declarable as `mcpAuth: { tokenEnv }` in `janux.config.ts` |
| `csp` | `true \| { nonce?, header? }` | Strict CSP: nonces every inline script and style the framework emits, and with `true` also sends the header. See the [CSP recipe](/docs/recipes/csp) |
| `onAudit` | `(entry: AuditEntry) => void` | Called for every api() dispatch: tool, origin, guard, ok, and the verified agent key |
| `runtimeUrl`, `stylesheets`, `favicon`, `title`, `lang`, `islandModules` | | Shell wiring (the CLI/plugin set these for you) |

Returns `{ fetch(req): Promise<Response>, apiTools, manifestFor, instancesFor, listPages, notFoundPage }` — mount `fetch` on Bun.serve, or anything Request/Response-shaped. `notFoundPage()` renders the app's `_404.tsx` as a standalone document (or `undefined` when the app has none), which is how `janux build` writes `404.html` for a static host. `instancesFor(path, ctx, hooks?)` is the same mounted tree `manifestFor` describes, live instead of serialized — the islands and stores a fresh render mounts, so a caller outside the browser can invoke an intent on one (`janux run` does). Its optional `hooks` carry the audit sink and the `onProposal` a `confirm` guard hands its parked `Proposal` to.

## Route modules

```ts
export const meta = { title: 'Shop', description: '...' };          // or a function:
export const meta = ({ params }) => ({ title: `Order ${params.id}` });

export const staticParams = [{ id: '1' }, { id: '2' }];             // or a function (async supported):
export const staticParams = () => orders.map(({ id }) => ({ id }));

export default async function Page({ ctx, params }) { ... }         // async supported
```

`routes/index.tsx` → `/` · `routes/orders/[id].tsx` → `/orders/:id` (params decoded).

`routes/_404.tsx` and `routes/_500.tsx` are pages no URL matches: the first answers an unmatched path (or a page that called `notFound()`) with a `404`, wrapped in the root `_layout`; the second answers a page that threw with a `500`, on its own. Both receive `{ ctx }`, `_500` also the thrown `error`. See [Navigation § Not found & server errors](/docs/guide/navigation).

`staticParams` enumerates the concrete pages of a dynamic route: `llms.txt` lists `/orders/1`, `/orders/2` instead of the raw `/orders/[id]` pattern, and with `output: "static"` they become the prerendered pages. Without it, the pattern is listed as-is (and the route is skipped in static builds). See [Deploying → Static export](/docs/recipes/deploying).

### The document head (`PageMeta`)

`meta` returns a `PageMeta`. `title` and `description` fall back to the app config; everything else is per-page:

```ts
import { articleJsonLd, type PageMeta } from 'janux';

export function meta({ params }): PageMeta {
  return {
    title: 'What is Janux? — Janux docs',
    description: 'The fullstack framework for the Agentic Web.',
    image: '/og/what-is-janux.png',   // og:image + twitter:image
    canonical: `/docs/${params.section}/${params.slug}`,
    robots: { index: true, follow: true, maxImagePreview: 'large' },
    og: { type: 'article', siteName: 'Janux' },
    jsonLd: articleJsonLd({ type: 'TechArticle', headline: 'What is Janux?' }),
  };
}
```

| Field | Emits |
|---|---|
| `title`, `description` | `<title>` and the description meta |
| `image` | `og:image` + `twitter:image`, and switches the card to `summary_large_image` |
| `canonical` | `<link rel="canonical">` + `og:url` |
| `robots` | `<meta name="robots">` — a typed `RobotsMeta` object (serialized in a stable order) or the raw content string |
| `og`, `twitter` | `og:*` / `twitter:*` with **unprefixed keys** (`{ type: 'article' }`), overriding the derived values key by key. `OpenGraphMeta`/`TwitterMeta` type the common keys; camelCase aliases name the ones a literal key cannot (`siteName` → `og:site_name`, `imageAlt` → `og:image:alt`, `publishedTime`/`modifiedTime` → `article:*`), and any other property passes through by its unprefixed or full name |
| `jsonLd` | One `<script type="application/ld+json">` per entry (an object or an array) |
| `head` | `{ tag, attrs?, text? }[]` — anything the fields above don't cover |

`og:*` and `twitter:*` are **derived** from `title`, `description`, `image` and `canonical`, so a page that sets those four already has a correct social card; you only reach for `og`/`twitter` to override.

`image` and `canonical` may be root-relative — Open Graph requires absolute URLs, so the shell resolves them against [`siteUrl`](/docs/reference/cli). Without a `siteUrl` a relative value is dropped rather than emitted broken, with a warning.

The escape hatch covers the rest — a preload hint, an alternate link, a domain verification tag:

```ts
head: [{ tag: 'link', attrs: { rel: 'preload', as: 'image', href: '/demo-poster.jpg' } }];
```

Every head node the shell writes carries a stable `id` (`jx-og-title`, `jx-jsonld-0`, `jx-head-0`, …). That is what lets [SPA navigation](/docs/guide/navigation) match them by identity across the document diff: leaving a page drops its social tags instead of stranding the previous page's card, and a tag both pages declare is updated in place.

### Structured data helpers

Three typed builders cover the JSON-LD shapes a content site needs — `articleJsonLd`, `breadcrumbJsonLd` and `organizationJsonLd`. Typed input in, schema.org naming out, absent fields dropped; the result is open, so a property the input does not carry spreads on:

```ts
import { articleJsonLd, breadcrumbJsonLd, organizationJsonLd } from 'janux';

const jsonLd = [
  breadcrumbJsonLd([
    { name: 'Blog', url: 'https://example.com/blog' },
    { name: 'Hello' },                       // no url: the crumb for this very page
  ]),
  {
    ...articleJsonLd({
      type: 'BlogPosting',                   // 'Article' by default
      headline: 'Hello',
      datePublished: '2026-07-20',           // ISO, as content collections store it
      author: { name: 'Aral' },              // becomes a schema.org Person
    }),
    isPartOf: { '@type': 'WebSite', name: 'Example' },
  },
  organizationJsonLd({ name: 'Example', url: 'https://example.com', sameAs: ['https://github.com/example'] }),
];
```

URLs are taken as written — resolve them against your site's origin yourself; JSON-LD has no notion of a base URL.

### RSS

`src/feed.ts` default-exports a `FeedConfig` and the app serves `GET /rss.xml` — the same idea as `llms.txt` and the per-page markdown projections in the [agent surface](/docs/guide/agent-and-copilot), for human readers:

```ts
// src/feed.ts
import type { FeedConfig } from 'janux';
import { allPosts } from './content';

export default {
  title: 'My blog',                    // falls back to the app `title`
  description: 'Posts about things.',
  items: () =>
    allPosts().map((post) => ({
      url: `/posts/${post.id}`,        // root-relative or absolute
      title: post.data.title,
      description: post.data.description,
      date: post.data.date,            // ISO — becomes pubDate
    })),
} satisfies FeedConfig;
```

The router knows pages, not titles or dates, so the app maps its own [content collection](/docs/guide/content-collections) into `items()` — newest first, since that is the order the feed carries. It runs when the feed is first requested, not at boot, and the response is memoized like `llms.txt`.

The feed needs [`siteUrl`](/docs/reference/cli): a feed of relative links is invalid. Every page then advertises it with `<link rel="alternate" type="application/rss+xml">`, and `output: "static"` writes `rss.xml` beside the pages, so a static host serves it with no server at all.

An item's `author` is a name, emitted as `dc:creator` — RSS reserves `<author>` for an email address and a feed carrying a name there is rejected as invalid.

> **Why a module and not a config field?** `items()` is behavior, and a deployment adapter serializes the app config to JSON — which drops functions silently. A conventional module is one the bundler inlines, so the feed keeps working where the app is bundled into a serverless function.

## HTTP surface

| Endpoint | Method | Purpose |
|---|---|---|
| `/_janux/api/<module>.<name>` | POST | Invoke an api(); `x-janux-origin: agent` enforces agent guards |
| `/_janux/approve` | POST `{id}` | Execute a pending proposal (once; replays 404) |
| `/_janux/reject` | POST `{id}` | Discard a pending proposal |
| `/_janux/manifest?path=/shop` | GET | Manifest for that route: mounted components + stores + api tools |
| `/_janux/agent` | POST | The copilot turn protocol (see [Agent API](/docs/reference/agent-api)) |
| `/sitemap.xml` | GET | Every page the router knows, absolute — when `siteUrl` is set (dynamic routes expanded via `staticParams`) |
| `/robots.txt` | GET | `Allow: /` plus the sitemap link — when `siteUrl` is set |
| `/rss.xml` | GET | RSS 2.0 feed of the app's `src/feed.ts` — when `siteUrl` is set and the app has one (see [RSS](#rss)). Every page advertises it with a `rel="alternate"` link |

Error envelope: `{ ok: false, error }` with 400 (invalid input), 401 (`agent_required`), 403 (forbidden), 404, 500.

### The response states its own nonce

A page served with `csp` carries `x-janux-nonce: <nonce>` (`NONCE_HEADER`) alongside the policy. The client runtime re-runs the scripts a navigated page brings — which is what gives them a valid nonce — and it re-stamps **only** the ones already carrying this response's nonce. Markup can forge anything in the body and nothing in the headers, so an injected `<script>` is left inert instead of being handed the capability the policy exists to withhold. See the [CSP recipe](/docs/recipes/csp).

### Client navigations announce themselves

A page fetched by the client runtime during an SPA navigation carries `x-janux-navigation: 1` (`NAVIGATION_HEADER`). The server answers those without the inlined stylesheet: the live document already has it, the client keeps its `<style>` nodes across the diff, and re-sending it puts kilobytes in front of the content the visitor is waiting for — 27 KB of this site's 95 KB page.

```ts title="a CDN in front of the app"
import { NAVIGATION_HEADER } from '@janux/server';

// Two different responses share one URL, so anything caching them must vary on it.
const vary = NAVIGATION_HEADER;
```

If you cache pages at the edge, **vary on that header** — a navigation response and a first-load response are not interchangeable.

> **Warning:** the origin header is not a security boundary — `human` is the default and the *most privileged* origin by design. Authentication belongs in `ctxFor`; guards control the agent, not the network.

## Sessions (createSessionStore)

Janux authenticates nobody — `issue()` is called by *your* login handler, once *your* provider decided who this is. What the store owns is the cookie: signed, expiring, rotating.

```ts title="src/session.ts"
import { createSessionStore } from '@janux/server';

export default createSessionStore<{ userId: string; scopes: string[] }>({
  secret: process.env.SESSION_SECRET!,
  ttlMs: 7 * 24 * 60 * 60_000,   // default: 7 days
  rotateAfterMs: 12 * 60 * 60_000, // default: half the ttl
});
```

| Member | Signature | What it does |
|---|---|---|
| `issue(data)` | `→ Set-Cookie string` | A new session. Call it on login **and on privilege change** — a fresh value is what defeats fixation |
| `read(req)` | `→ { data, expiresAt, renew? } \| undefined` | Verified and unexpired, or nothing. `renew` is present past `rotateAfterMs` |
| `clear()` | `→ Set-Cookie string` | Ends it browser-side |

Options: `secret` (required), `name` (`janux_session`), `ttlMs`, `rotateAfterMs`, `path`, `domain`, `sameSite` (`Lax`), `secure` (`true`), `now` (injectable clock).

`src/session.ts` is the convention — `janux dev` and `janux start` pass its default export as the `session` option, which is what makes rotation automatic: the server reads the cookie once per request, hands the payload to `ctxFor`, and appends the renewed `Set-Cookie` to whatever response comes back. Nothing is stored server-side, so the payload is **signed, not encrypted** (an id and a grant, never a secret), and a replaced cookie stays valid until its own expiry.

The store mints **no CSRF token**: every mutating `/_janux/*` request is already refused cross-site by the invocation pipeline, before a handler runs. See the [auth recipe](/docs/recipes/auth-and-context).

## Verified agent identity (Web Bot Auth)

External agents can sign requests per [RFC 9421 / Web Bot Auth](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/) (Ed25519 HTTP message signatures). Configure an allowlist of agent public JWKs:

```ts
createJanuxServer({
  agents: {
    webBotAuth: { keys: [agentPublicJwk] },
    policy: 'observe',   // default: identify agents, serve everyone
  },
});
```

Signed requests get `ctx.agent = { verified, keyId }` (also `null`/absent when unsigned); use it in `ctxFor`-style authorization, guards or `run()`. Under `policy: 'require'`, unsigned or unverified requests with `x-janux-origin: agent` receive `401 { error: 'agent_required' }` — human traffic is never gated, and neither is the embedded copilot (`/_janux/agent`): it acts on the signed-in user's own session, so its authentication belongs in `ctxFor` like any human traffic. Fail closed: unknown key, bad signature, expired window, or `require` with an empty allowlist all deny.

Not built yet: fetching keys from a signature-agent directory (SSRF story needed), nonce single-use enforcement, rate limiting (put it in `ctxFor` or your middleware — `onAudit` gives you per-tool outcome data to alert on).

## Low-level exports (advanced)

`createJanuxServer` composes these; import them directly only to embed Janux in another server or to test pieces in isolation.

| Export | Signature | What it does |
|---|---|---|
| `collectApis(modules)` | `{ shop: mod } → ApiTool[]` | Turns `*.api.ts` module exports into namespaced tools (`api.shop.pay`). Rejects names containing `__`. |
| `invokeApi(tool, input, ctx, origin, onAudit?)` | `→ Promise<result>` | The single dispatch pipeline: guard → validate input → `run` → validate output → audit. Agent-origin `forbidden` throws `JanuxIntentError`. |
| `apiManifestTools(tools, ctx)` | `→ ManifestTool[]` | Projects api() tools into the manifest (non-`forbidden` only, with JSON Schema input). |
| `isApi(value)` | `→ value is ApiDef` | Type guard for an `api()` result. |
| `createFsRouter(dir)` | `→ { routes, match(pathname) }` | The file-system router. `match` returns `{ filePath, pattern, params }`, static routes preferred over dynamic. |
| `discoverSkills(dir)` | `→ Skill[]` | Reads a `src/skills/**` directory: flat `*.md` files and `<name>/SKILL.md` packages, sorted by name, frontmatter validated. A missing directory is simply no skills. See the [skills guide](/docs/guide/skills). |
| `parseSkill(source, id, file?)` | `→ Skill` | One skill file: `{ name, description, when?, tools, body, file }`. Throws on missing frontmatter or a missing `description`. |
| `skillIndex(skills)` | `→ SkillSummary[]` | Drops every body, leaving what the manifest and MCP's resource list carry. |
| `buildLlmsTxt(config, pages, tools)` | `→ string` | Renders the `llms.txt` body — pages plus the agent tool index (`confirm` tools annotated). |
| `createAgentAuth(config)` | `→ { policy, identify(req) }` | Web Bot Auth verifier. `identify` returns `{ verified, keyId } | { verified: false } | null` (unsigned). |
| `strictPolicy(nonce)` | `string → string` | The recommended `Content-Security-Policy` value: `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`. Compose your own policy on top of it in `csp.header`. |
| `htmlDocument(options)` | `ShellOptions → string` | Wraps rendered `html` into the full document shell: snapshot scripts, island module map, stylesheets, favicon, i18n payload. |
