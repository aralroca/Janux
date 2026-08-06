# @janux/cli

## 0.7.0

### Minor Changes

- `janux upgrade` and `janux codemod`: the migration tooling the stability contract owes.

  Janux is 0.x, so a minor is the breaking bump. `STABILITY.md` promises a stable export is deprecated before it goes; this is the other half — for the breaks that cannot be absorbed by a deprecation, the release now ships the thing that applies them.

  `janux upgrade` runs the codemods for the breaking changes between the version an app is on and the one it is moving to. `--from` defaults to the `janux` the app actually resolves and `--to` to the version of the CLI being run, so after bumping the dependency the bare command is usually right. The range is half-open — a codemod runs when its release is after `--from` and at or before `--to`. One codemod exists so far, for the only break since 0.3: `0.5.0/events-by-name` turns `on={intents.x}` into `onClick={intents.x}` and `<form intent={intents.x}>` into `onSubmit`.

  `janux codemod <id>` runs one by name, which is how the framework migrations are reached: `next/routes`, `next/metadata`, `next/imports`, `astro/routes` and `astro/content` translate the mechanical part of an app arriving from Next or Astro — file structure (including moving colocated files out of `src/routes`, which would otherwise become URLs, and rebasing every relative import the moves break), the metadata export, and the imports that have an equivalent. What has none is reported against the file it was found in rather than half-translated.

  Two rules hold for every codemod, and the suite enforces both for each of them: `--dry-run` prints the unified diff it would write and writes nothing, and running one twice is the same as running it once. Codemods parse with `@swc/core` and splice the byte spans under the nodes that changed, so a one-attribute rename is a one-line diff and the rest of the file — formatting and comments included — is untouched.

  Two migration guides ship with them, deliberately unflattering about how much is automatic: [Migrating from Next.js](https://janux.build/docs/more/migrating-from-next) and [Migrating from Astro](https://janux.build/docs/more/migrating-from-astro).

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

- Auth batteries and per-agent authorization — two different questions, answered separately.

  **Sessions.** `createSessionStore` is the cookie half of auth and nothing else: signed, absolutely expiring, and rotating past `rotateAfterMs` so a value lifted from a log or a proxy stops working without the user noticing. It authenticates nobody — your provider does, and calls `issue()`. `src/session.ts` is the convention; wiring the store into the server is what makes rotation real, since `ctxFor` returns a `Ctx` and has no response to write the renewed cookie to. That `ctxFor` now receives a second argument carrying what the framework already verified: the session payload and the Web Bot Auth identity.

  **Scopes.** Web Bot Auth says _who_ is calling; `scopes` on an `api()` or an `intent()` says what that caller may do. `ctx.scopes` is the credential's grant (absent ⇒ none) and `ctx.agent.scopes` narrows it, so the effective grant is an intersection and an agent can never out-rank the user it acts for. Enforced in the invocation pipeline and never in app code, at both ends: a tool outside the grant is absent from every listing _and_ refused when called — over HTTP as much as through the bridge or MCP, whatever `x-janux-origin` claims. An invisible tool is not a protected tool.

  `SECURITY.md` moves "manifest scoping" from an area of interest to a guarantee with a corpus behind it.

- Skills: procedures the model loads on demand. Drop a markdown file in `src/skills/` — `refund.md`, or `refund/SKILL.md` when it will grow siblings — with a `description` and, optionally, `when` to reach for it and the `tools` it uses. Frontmatter is validated by the same `schema()` that types component state.

  The split is the point. The index (name, description, when) rides in every manifest, small enough to always be in context; the body is fetched one at a time. The built-in copilot gets a `load_skill` tool for it, and external clients get the same contract over MCP, where the resource list is the index and `resources/read` on `janux://skill/<name>` is the body. Loading a skill is a read: it invokes nothing, and the tools a procedure describes are still called through the invocation pipeline with their guards.

  `janux verify` now holds a skill to the mounted tree. Every tool it declares in frontmatter, or writes down in its prose and worked examples, has to be a tool the app really has — otherwise the check fails, naming the skill and the file. A skill that names a tool nobody implemented is a mistake other frameworks can only find at runtime.

  See the [skills guide](https://janux.build/docs/guide/skills) and `examples/with-skills`.

- Testing, at the application level: the new `@janux/testing` package adds a route harness (`createTestApp` — a page through its real `_layout` chain, middleware and `ctx`, in-process), `api()` mocking at the invocation boundary (`mockApi`/`resetApiMocks`, with guards and schemas still enforced), and Playwright fixtures whose `goto` waits for `janux.settled()` instead of a sleep. `janux test` runs an app's suite with `bun test`.

### Patch Changes

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

## 0.6.0

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
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

## 0.5.0

### Minor Changes

- `output: "static"` emits the Markdown projection next to every page.

### Patch Changes

- Suspense-only pages ship their runtime.

## 0.4.0

Released with the framework; no changes of its own.
