# janux

## 0.7.0

### Minor Changes

- Boot features are imports now, so unused layers ship zero bytes.

  `boot({ glow: true, cursor: true })` forced every app to bundle the glow painter, the simulated cursor, the i18n installer and the query-payload hydration — used or not; that always-on wiring had grown the krausest fixture's shipped JS from 24.7KB to 34.8KB gzip, past the 0.5×react ratio guard. The optional layers are now code the app imports, not flags the runtime resolves:

  ```ts
  import { boot, agentGlow, agentCursor, i18n } from "janux/client";

  boot({ defs: [App], glow: agentGlow(), cursor: agentCursor(), i18n: i18n() });
  ```

  - `glow` / `cursor` take `agentGlow(options?)` / `agentCursor(options?)` instead of `boolean | options`. Passing `true` is a type error, and dev builds warn at runtime.
  - New `i18n: i18n()` boot feature reads the page's embedded dictionary and re-reads it after every SPA navigation. Apps without translations no longer ship `translate-core`. Apps WITH translations must add it — this was previously unconditional.
  - Query-payload hydration moved out of `boot()` into the first browser `getQueryClient()` (the payload sink on `window.__JANUX_QUERY__` queues chunks until then, so nothing is lost and SSR data is still never refetched). Apps with no queries no longer ship the query cache.
  - The always-on WebMCP surface keeps its visual primitives through the new `janux/client` seam module (`emitToolTarget`, `suspendAgentGlow`, `glowElement`, `injectGlowStyles`, `GLOW_CLASS`) — `enableAgentGlow`/`enableAgentCursor` remain exported for manual wiring, and `BootFeature` is the contract a custom feature implements.
  - The package now declares `"sideEffects": false`: importing any `janux` module has never had an observable global effect, and saying so lets bundlers drop re-exported-but-unused modules (the SSR unsuspense runtime among them) from client builds.

  Measured on the krausest bundle fixture: 34,818 → 30,937 bytes total js gzip (react: 62,120) — back under the `js_gzip ≤ 0.5×react` and `fw_gzip ≤ 0.5×react` guards.

- `redirects` and `rewrites` in `janux.config.ts` — the URL map a migrating product arrives with, kept inside the framework.

  Until now a product with a history had to leave the router to answer its old URLs: a custom server or a reverse proxy, which is routing in a place neither the manifest nor `janux verify` can see. Both are declared now, in **the file router's own segment grammar** — `[param]`, `[param=matcher]`, `[...rest]`, `[[...rest]]`, the app's own matchers included — parsed by the same `parsePattern` (now exported from `@janux/server`) and matched by the same code the route tree uses. Two pattern languages in one framework is a design bug, so there is one.

  ```ts
  export default defineConfig({
    redirects: [
      { from: "/kb/[slug]", to: "/wiki/[slug]" },
      { from: "/plans", to: "/pricing", status: 301 },
    ],
    rewrites: [{ from: "/handbook/[...path]", to: "/docs/[...path]" }],
  });
  ```

  A redirect answers with a status (default **308**, the one that may not turn a POST into a GET) and a `Location` carrying whatever the pattern captured, plus the query the visitor arrived with. A rewrite serves another route and tells the browser nothing.

  **Precedence is written down and tested:** `src/middleware.ts` → redirects → rewrites → the i18n locale redirect → the route. A legacy URL is therefore answered as itself rather than bounced to its localized form first, so the map is written once and not once per locale. Rules resolve in declaration order, first match wins.

  **A rewrite cannot become a way around a guard.** `/_janux/*` is unreachable from one: a literal destination fails at boot, and one assembled from the URL at request time is refused rather than throwing, so a hostile path cannot turn a rule into a 500. Declared rules never apply to a request already addressed to `/_janux/*` either, so a greedy `[...all]` is a migration map and not a decision to take the agent surface off the air. Chains settle in at most 8 hops and a cycle raises an error naming it; a redirect pointing at its own source is refused where it is written, because no hop limit can catch a loop that runs in the browser.

  An app declaring neither pays nothing: the rules compile to `undefined` and the request never calls in.

  **Adapters.** `AdapterCapabilities` gains `redirects` — whether the target can express the rules in its own routing config, which is the only way they exist under `output: 'static'`. `@janux/vercel` declares `true` and compiles them into the Build Output routing table ahead of the filesystem handler; `janux build` reports the gap for a target that cannot, and says so on its own too. Third-party adapters must add the flag.

- `janux run <tool> --arg value` invokes an `intent()` or an `api()` from the terminal — the last face of "one definition, N projections", and a derived one: the tools are the ones the manifest already advertises, the flags are the ones their input schema already describes, and `--help` is generated from it. Nothing is declared for the CLI. `janux run` with no tool lists everything the app projects, with its guard.

  Guards hold, because it is the same pipeline: calls go out as `origin: 'agent'` (a terminal is not a session), so `forbidden` is neither listed nor callable and `confirm` parks the call — prompting on a terminal, and **failing with exit 1** when there is nobody at one, rather than auto-approving. There is no `--yes` flag. Results are JSON on stdout, prose on stderr, so `janux run api.orders.reconcile --since 2026-01-01 | jq` is a CI step and not a hand-written HTTP client.

  Two seams made it possible, both useful on their own: `createJanuxServer(...)` now returns `instancesFor(path, ctx, hooks?)` — the live islands and stores a render mounts, which is what `manifestFor` describes serialized — and a parked proposal no longer computes its shadow diff for a host that shows none (`proposalDiff: false`), so an intent's body is not run speculatively before a human approves it.

- Per-route metadata is typed the rest of the way, and a content site can finally publish a feed. `og`/`twitter`
  become `OpenGraphMeta`/`TwitterMeta` and `robots` accepts a `RobotsMeta` object serialized in one stable order, so
  the values a page declares are checked rather than spelled. CamelCase aliases name the properties a literal key
  cannot — `siteName` → `og:site_name`, `imageAlt` → `og:image:alt`, and `publishedTime`/`modifiedTime` →
  `article:published_time`/`article:modified_time`, which escape the `og:` prefix entirely because they belong to
  another vocabulary. Every previous spelling still type-checks and emits identical bytes, ids included: an id keeps
  only the first `:`, so nothing the SPA head diff matches on moved.

  `articleJsonLd`, `breadcrumbJsonLd` and `organizationJsonLd` build the structured data a content site needs —
  typed input in, schema.org naming out, absent fields dropped so a block never carries `"description":undefined`.
  The results stay open, so a page spreads what the input does not carry on top: `{ ...articleJsonLd(x), isPartOf }`.

  `src/feed.ts` publishes the site's content at `GET /rss.xml`, the same idea as `llms.txt` and the per-page markdown
  projection, for human readers. The router knows pages, not titles or dates, so the app maps its own content layer
  into `items()` — usually a collection, newest first — and the response is memoized like `llms.txt` because that
  call typically reads every content file off disk. It is doubly opt-in (`siteUrl` and the module), every page
  advertises it with a keyed `rel="alternate"` link emitted only where the feed will actually resolve, and
  `output: "static"` writes it beside the pages through the same hook that writes the sitemap — so a static host
  serves it with no server at all.

  It is a conventional module rather than a `janux.config.ts` field for a reason worth stating: a deployment adapter
  resolves the app config at build time and serializes it into the generated bundle as JSON, which drops functions
  silently. A feed declared in the config would have answered `/rss.xml` with a 500 on Vercel and Node while working
  perfectly in dev, in tests and in a static export. `src/feed.ts` is a module the bundler inlines, like `src/ctx.ts`
  and `src/middleware.ts` beside it.

  One detail worth stating, because it is invisible until a validator says so: an author's name is emitted as
  `dc:creator`, not `<author>`. RSS reserves that element for an email address, and a feed carrying a name there is
  rejected outright.

- Auth batteries and per-agent authorization — two different questions, answered separately.

  **Sessions.** `createSessionStore` is the cookie half of auth and nothing else: signed, absolutely expiring, and rotating past `rotateAfterMs` so a value lifted from a log or a proxy stops working without the user noticing. It authenticates nobody — your provider does, and calls `issue()`. `src/session.ts` is the convention; wiring the store into the server is what makes rotation real, since `ctxFor` returns a `Ctx` and has no response to write the renewed cookie to. That `ctxFor` now receives a second argument carrying what the framework already verified: the session payload and the Web Bot Auth identity.

  **Scopes.** Web Bot Auth says _who_ is calling; `scopes` on an `api()` or an `intent()` says what that caller may do. `ctx.scopes` is the credential's grant (absent ⇒ none) and `ctx.agent.scopes` narrows it, so the effective grant is an intersection and an agent can never out-rank the user it acts for. Enforced in the invocation pipeline and never in app code, at both ends: a tool outside the grant is absent from every listing _and_ refused when called — over HTTP as much as through the bridge or MCP, whatever `x-janux-origin` claims. An invisible tool is not a protected tool.

  `SECURITY.md` moves "manifest scoping" from an area of interest to a guarantee with a corpus behind it.

- Simulated agent cursor, combinable with the glow.

  `boot({ cursor: true })` — or `{ cursor: { duration } }` — paints an overlay arrow that travels the screen element to element as an agent operates the page, starting from the center of the viewport on its first move. It consumes the same `janux:tool-call` / `janux:tool-target` events as the glow, so the two layers combine freely: both, either, or neither. Style it like the glow, via the `--janux-cursor-*` CSS variables on `#janux-agent-cursor`; `suspendAgentGlow()` stands both built-in layers down, so a richer visualizer replaces them together. New from `janux/client`: `enableAgentCursor`, `moveCursorTo`, `injectCursorStyles`, `CURSOR_ID`.

  The playground's agent panel gained a second checkbox for the cursor (on by default, like the glow's), and every example that boots `glow: true` now boots `cursor: true` alongside it. Both layers' default ring color moves from violet to blue (`rgba(37, 99, 235, …)`) — override via the CSS variables as before.

  Both built-in layers now honor a declared `glowTarget`: on `ok` they wait out the tick the created DOM needs to mount (a React Flow node) and paint that exact element — node-level feedback — instead of lighting the whole island. The cursor also re-measures its target once the travel settles, so a canvas that re-fits underneath doesn't strand the arrow where the element used to be.

- Skills: procedures the model loads on demand. Drop a markdown file in `src/skills/` — `refund.md`, or `refund/SKILL.md` when it will grow siblings — with a `description` and, optionally, `when` to reach for it and the `tools` it uses. Frontmatter is validated by the same `schema()` that types component state.

  The split is the point. The index (name, description, when) rides in every manifest, small enough to always be in context; the body is fetched one at a time. The built-in copilot gets a `load_skill` tool for it, and external clients get the same contract over MCP, where the resource list is the index and `resources/read` on `janux://skill/<name>` is the body. Loading a skill is a read: it invokes nothing, and the tools a procedure describes are still called through the invocation pipeline with their guards.

  `janux verify` now holds a skill to the mounted tree. Every tool it declares in frontmatter, or writes down in its prose and worked examples, has to be a tool the app really has — otherwise the check fails, naming the skill and the file. A skill that names a tool nobody implemented is a mistake other frameworks can only find at runtime.

  See the [skills guide](https://janux.build/docs/guide/skills) and `examples/with-skills`.

- Prompt injection, contained in the pipeline instead of argued about in the prompt.

  Because the mounted tree _is_ the agent surface, untrusted content rendered into it goes straight into the model's context — a visitor's comment, an uploaded PDF, a remote MCP server's answer. Guardrail processors already cover what enters and leaves the model; this covers the half only the framework can, because the framework owns the invocation pipeline.

  Content is marked where it enters. `str().untrusted()` declares a state field fed by input the app did not author; everything the outbound MCP client returns and every attachment `acceptAttachments` accepts is untrusted by construction, with nothing to declare. The mark travels: into the JSON Schema (`x-janux-untrusted`), the manifest and `ui://` resources, and the per-page Markdown projection, where the island that renders it is fenced with a per-call nonce — a fixed delimiter is worthless, since a payload that writes its own closing tag would carry on as trusted prose.

  Then two invariants, enforced where guards already are, for clicks, bridge calls, MCP, A2A and HTTP alike. A chain that read untrusted content resolves to `origin: 'agent'` whatever it claims — without that, a poisoned chain could present itself as a person and walk past the approval it was meant to hit. And an intent or `api()` declaring `effect: 'irreversible'` degrades from `guard: 'auto'` to `'confirm'`, so it parks as a proposal a human settles. Guards only ever move upwards; `confirm` and `forbidden` are untouched.

  None of it is lexical — no wordlists, no classifiers, no filtering — so nothing here is defeated by rephrasing. `packages/conformance/security/prompt-injection.cases.ts` runs payloads from the OWASP LLM01 literature against every door from every source, and the false-positive rows sit beside them: a human click, an agent on a clean chain, an app that declares nothing untrusted and a reversible tool all stay exactly as unguarded as before.

  Also fixed: the proposal diff shadow-runs the intent body, which must never be why an irreversible body ran before anyone approved it. `dryRunDiff` now refuses an `effect: 'irreversible'` intent, as it already refused `server` ones.

  See the [prompt injection guide](https://janux.build/docs/guide/prompt-injection) and the [provenance API](https://janux.build/docs/reference/taint-api).

## 0.6.0

### Minor Changes

- `foreign()` maps React callback props onto intents, keeps portals alive across a navigation, and hands React plain
  data so a foreign component cannot capture a live state proxy. State identity is stable across re-renders, which is
  what data grids, charts and virtualization libraries assume.
- Hovering a link warms the route manifest as well as the page, so the first navigation after a hover no longer waits
  on a manifest fetch. Prefetching waits 60ms for intent, requests at low priority, and aborts when a navigation
  starts, so a pointer crossing a nav bar no longer costs a request per link.
- Strict CSP: `csp: true` mints a nonce per request and stamps it on every inline script and style the framework
  emits — resume payload, island map, runtime, speculation rules, query hydration, suspense boundary swaps, inlined
  CSS, JSON-LD, `meta.head` and `<script>`/`<style>` written in JSX — then sends
  `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`. No code path uses `eval` or
  `new Function`, so `'unsafe-eval'` is never needed, and an app that does not configure `csp` gets byte-identical
  HTML.

  SPA navigation is where this is easy to get wrong: re-creating the scripts a navigated page brings is what gives
  them a valid nonce, so doing it indiscriminately would launder an injected `<script>` into an executed one. The
  response states its own nonce in `x-janux-nonce`, out of reach of its own markup, and only tags already carrying
  that value are re-stamped. Nonces are validated against the CSP `base64-value` grammar, and a nonced document is
  never kept in the shared response cache — a stored nonce is one every later visitor would share.

- `worker()` — a new `janux/worker` entry point that runs a function on a Web Worker thread, so expensive work stops
  blocking clicks, typing, scrolling and animation. It is marked **experimental** in `STABILITY.md`: the worker is
  emitted by a source transform because Vite cannot emit a worker chunk from a plugin, and that strategy is expected
  to change under the API.

### Patch Changes

- `janux dev` shows a failure inside an `intent()`, `effect()` or `source()` with the chain that explains it — route,
  `_layout` chain, island, the named behavior, and, for an invocation, the guard the pipeline resolved and the origin
  it resolved it for — above the JS stack. The original error is still logged to the console, which a failed intent
  previously never reached. The overlay is dev-only and eliminated from production builds.

  Sourcemaps are on: full in dev, with the framework's own frames resolvable, and `hidden` in production, so `.map`
  files exist for an error tracker without a `sourceMappingURL` reaching the browser.

  `janux info` prints versions, the resolved config, detected adapters, active zero-config integrations and every
  route as markdown to paste into an issue unedited.

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

## 0.5.0

### Minor Changes

- **Breaking: `on=` and `intent=` are gone.** Events bind by name — `onClick`, `onSubmit`, `on<Event>` — which
  generalizes the old marker rule to any event instead of an allowlist. Every call site has to be migrated.
- `intents.x.with(input)` returns a bound ref that renders its own `data-input`.
- Typed JSX: `style` accepts a `CSSProperties` object (csstype), every HTML and SVG element is typed per tag,
  `IntentRef` reserves the `on*` namespace, and passing a closure to a handler now fails at compile time.
- Declarative drag & drop: binding `onDrop` enables the zone.
- Streaming suspense and error boundaries in `component()`, with mid-stream boot, navigation epochs and late
  snapshots on the client.
- `run()` and dynamic guards can see the caller's origin (human or agent).
- Intents opt into form coercion, so one typed schema serves both faces.
- Def-level config objects reach `persistStore()`.

### Patch Changes

- Keyed child reconciliation in `morph`, a JSX-against-DOM reconciler for the island render loop, and intent runs
  batched into one reactive flush per body.
- Unbounded retention under sustained SSR: the coalescer is a push pump now.
- A navigation to the current URL is cancelled rather than handed back to the browser.
- The end-of-chunk sentinel is keyed — navigations into a suspense page went empty without it.
- The boolean-token branch no longer bypasses the attribute-name guard.

## 0.4.0

### Minor Changes

- `renderToStream()`: HTML flushes as it renders, and siblings still render in parallel.
- Prefetch and speculation rules are configurable from `janux.config.ts`.

### Patch Changes

- A superseded navigation aborts its page stream, and dropping a persisted island warns instead of failing silently.
- Speculation rules are re-narrowed after every navigation.
- `diff-dom-streaming` 0.6.8.
