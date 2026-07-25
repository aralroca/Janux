# Known gaps

Two kinds of entry live here, both produced while building the conformance
corpus (`packages/conformance`):

1. **Cases we deliberately do not test**, because they exercise a feature Janux
   does not have. They are recorded rather than dropped so the backlog of design
   decisions stays visible, and so nobody re-derives them from scratch.
2. **Traps in the tooling** that cost real time to find and would silently come
   back if left undocumented.

Empty `test.todo` entries are never used for either: they inflate the test count
without asserting anything.

## Features Janux does not have (cases discarded)

| Case family | Source | Why it does not apply |
|---|---|---|
| Suspense boundaries, `use()`, async components | `react:ReactDOMFizzServer`, `vue:apiAsyncComponent` | Janux has no suspense primitive. Sources load server-side before the island is serialized; there is no in-render await to suspend. |
| Streaming SSR, out-of-order flushing, shell/boundary timing | `react:ReactDOMFizzServer`, `marko:runtime-tags` | `renderToString` is a single pass. Streaming was never a goal: a page with no islands ships no `<script>` at all, so there is nothing to stream in. |
| Portals / `<Teleport>` | `vue:ssrTeleport`, `react:ReactDOMServerIntegration` | No portal primitive. An island renders where it is declared. |
| Transitions, animations, `<TransitionGroup>` | `vue:rendererComponent`, `svelte:transition` | Not a framework concern in Janux; `morph` preserves nodes but exposes no transition hook. |
| Dependency injection, `provide`/`inject`, injector hierarchies | `angular:core`, `vue:apiInject` | State is shared through `store()` and `use:`, not an injector tree. |
| Class components, lifecycle methods, `this`-bound rendering | `react:ReactComponentLifeCycle` | Components are plain definitions; there is no instance for a lifecycle to hang on. |
| Hooks rules (order, conditional calls), `useSyncExternalStore` | `react:ReactHooks` | No hooks. Behaviour is named in `intents`/`effects`, so there is no call-order contract to break. |
| Error boundaries as components | `react:ReactDOMServerIntegration`, `vue:errorHandling` | Errors surface as a `janux:error` DOM event, not a boundary component. Whether Janux should grow a boundary is an open design question. |
| Hot module replacement | `vue:hmr` | Dev-server concern, delegated to Vite. |
| Template compilation, directives, slots-as-functions | `vue:compiler-*`, `svelte:compiler` | Janux has no template compiler. SWC is used only to rewrite `api()` calls into client stubs. |
| Server Components / Flight protocol | `react:ReactFlightServer` | Different architecture: Janux's server projection is the manifest plus `api()` endpoints, not a serialized component tree. |

## Tooling traps

### `coverageThreshold` in `bunfig.toml` is a decorative gate (Bun 1.3.14)

Two independent problems, both verified by moving a threshold above the real
number and reading the exit code:

- The singular keys `{ line = …, function = … }` parse without error and are
  **never enforced**. Only the plural `{ lines, functions }` are honoured.
- Even with plural keys it is enforced **per file, not on the total**. Because
  `client/api-stub.ts`, `client/upload.ts`, `config.ts` and
  `janux-vite/request-adapter.ts` currently sit at 0%, *any* positive threshold
  fails, so the gate is permanently red and therefore ignored.

The total-coverage floor is enforced in `scripts/test-census.ts`
(`bun run test:census --min-coverage 0.90`) instead. Bun's per-file gate becomes
usable — and is stricter than a total, since a total lets a well-covered file
hide an untested one — once those four modules have tests.

### Happy-DOM must be registered before importing anything that subclasses `EventTarget`

`@aralroca/gui-agent` bundles a WebMCP polyfill whose context class is written
`class extends EventTarget`, resolved when its module body evaluates. Imported at
test-module scope it therefore subclasses **Bun's native** `EventTarget`, while
`new Event(...)` at dispatch time returns a **Happy-DOM** `Event` — so
`dispatchEvent` throws `Argument 1 ('event') … must be an instance of Event`
internally, Happy-DOM swallows it, tests stay green, and the `toolchange` path is
never actually exercised.

Fix in `packages/janux-agent/src/local/copilot.test.ts`: call
`GlobalRegistrator.register()` at top level and `await import()` the modules
afterwards. A `bunfig.toml` preload would also fix it but is rejected for the
reason documented in that file. Upgrading Happy-DOM 15 → 18 does **not** fix it;
the cause is import order, not the version.

## Behaviours the corpus pins deliberately

Not gaps, but decisions worth stating because a reasonable reader expects
otherwise:

- **Writing state deep-copies.** `state.x = someObject` stores a structural
  clone, so a later mutation of `someObject` does not show up in state, and
  assigning `state.proxy` into itself stores a snapshot rather than a cycle.
- **A cyclic value is rejected, not stored.** `plainify` throws
  `Janux: cannot store a cycle in state ("<path>")` instead of overflowing the
  stack. A value merely *shared* by two siblings is fine and gets duplicated.
- **Tracking paths are escaped.** A state key containing a dot keeps its own
  tracking identity, so `state["a.b"]` and `state.a.b` are different paths. The
  escaped form (`a\.b`) is what appears in mutation-gate error messages.
- **A style number gets no unit.** `style={{ width: 10 }}` renders `width:10`,
  not React's `width:10px`. Auto-appending `px` requires a list of unitless
  exceptions (`lineHeight`, `flex`, `zIndex`, `opacity`, `order`, `flexGrow`, …)
  that is wrong the moment it is incomplete, so Janux asks for the unit.
- **Attribute names are emitted verbatim.** `tabIndex={3}` renders
  `tabIndex="3"`, not `tabindex="3"`. HTML attribute names parse
  case-insensitively so it behaves correctly, but the markup differs from React's.
- **String bounds count UTF-16 code units, not graphemes.** `str().max(1)`
  rejects a single emoji (2 units) and rejects a decomposed `é` (`e` + combining
  acute) while accepting the precomposed one. This matches `.length` and JSON
  Schema's `maxLength`, which is the contract the agent is handed, so the
  projection and the runtime agree — but it is not "characters as a human counts
  them". Grapheme-aware bounds would need `Intl.Segmenter` and a different
  keyword than `maxLength`.
- **`min()`/`max()` are refused, not ignored, on kinds without bounds.** Building
  `list(int()).min(2)`, `obj({}).min(1)`, `bool().min(1)` or `enums([]).min(1)`
  now throws at construction. Previously the flag was accepted and never read:
  `list(int()).min(2)` validated `[1]` as fine, and `bool().min(2)` rejected
  `true` with "below min 2". List-length bounds are therefore *not supported* —
  the docs define bounds as "length for strings, value for numbers", and adding a
  new capability was out of scope. Check the length inside the intent.
- **Interpolation is one pass, driven by the placeholders.** A query value is
  never re-scanned, so `t('{{a}}', { a: '{{b}}', b: secret })` yields the literal
  `{{b}}`. A placeholder whose name is not an *own* key of the query is left
  intact, which also means `{{toString}}` does not resolve off the prototype.
  Placeholder names match `[\w$.-]+`; a query key outside that set is inert
  rather than compiled into a pattern.
- **A default is validated like any other value.** `int().default('nope')` used to
  pass the string straight through into state. It now fails with
  `expected int`. A default that violates a bound added later
  (`int().min(10).default(1)`) also fails, since validation happens when the
  default is applied rather than when it is declared.

## Not fixed, and why

### `srcdoc` is a raw-HTML sink that does not look like one

`dangerHTML` announces itself. `srcdoc` does not: its value is correctly escaped
into the attribute, and the browser then un-escapes it and parses the result as
an HTML document **in the parent's origin**. So escaping is the intended way to
pass markup through `srcdoc` and offers no protection whatsoever —
`<iframe srcdoc={userInput}>` is same-origin XSS.

Left working deliberately. Unlike a `javascript:` URL, where the scheme is an
unambiguous signal, there is nothing in a `srcdoc` value that separates a safe
document from a hostile one, so blocking it would remove a real capability rather
than close a hole. `packages/conformance/security/raw-sinks.cases.ts` pins the
behaviour so it is a known sink rather than a surprise. If Janux ever grows a
sanitizer, `srcdoc` is where it belongs.

### The corpus reaches into janux's internals for two modules

`packages/conformance/ssr-html/attributes.test.ts` and `security/urls.test.ts`
import `renderAttrs` from `../../janux/src/render/html`, and
`state/reactive-state.cases.ts` imports `createReactiveState`/`createGate` the
same way. Neither is a public export, so the corpus is coupled to janux's file
layout: moving `render/html.ts` breaks conformance with no public-API change.

Everything else in the corpus goes through `'janux'` / `'@janux/server'`, and
`security/raw-sinks.cases.ts` deliberately proves the same area *can* be covered
through public `renderToString`. The 200-odd attribute rows assert
`renderAttrs`'s exact output (`' id="x"'`, leading space included), which is a
sharper contract than the surrounding element HTML — routing them through
`renderToString` would rewrite every row and blunt them. Left as-is; if the
coupling ever bites, the honest fix is an explicit `"./internal"` subpath in
janux's `exports` so it is declared rather than incidental.

### `useDom()` is corpus-only, so ten client tests still inline the pair

`packages/conformance/support/dom.ts` is described as the single Happy-DOM
registration point, and it is — for the corpus. The ten pre-existing files under
`packages/janux/src/client/*.test.ts` and `interop/foreign.test.ts` still inline
their own `beforeAll(register)`/`afterAll(unregister)`, because `janux` does not
depend on the private `@janux/conformance`. Unifying them means moving the helper
into `packages/janux/src/test-support/` and touching ten files that this work
otherwise has no reason to open.

### `decodeSegment` is duplicated in janux-vite

`packages/janux-vite/src/static-files.ts` already had the same
`try { decodeURIComponent } catch { return undefined }` guard with the same
"malformed escape ⇒ no match" policy. Sharing it would mean exporting a
`safeDecode` from `@janux/server` and adding a dependency edge for five lines,
which costs more than the duplication. Worth remembering if a third caller
appears, or if the policy ever hardens (e.g. also rejecting a decoded `..`).

### A state write costs ~16% more than before

Measured on this machine: 125 → 145 ns for a scalar write, while a four-deep
read went 235 → 222 ns (6% faster, from hoisting the duplicated `childPath`).
The extra 20ns buys the cycle check and the path escaping — both correctness
fixes — and reads are far more frequent than writes. Two earlier versions of the
change cost much more and were fixed rather than accepted: a declarative fold
over the path made `parentOf` 98x slower, and a `seen = new Set()` default
parameter allocated a Set on every write including the scalar case.

### Two instances of one component share a single addressable tool name

A tool is named `component.intent`, with no island key. Mount two `card` islands and
the manifest lists `card.inc` twice, while `islandIdFor` resolves it with
`document.querySelector` — always the first island in document order. So the second
instance is unreachable by an agent, and a call the agent believes targets card #2
acts on card #1. Observed live in `examples/nested-islands`, where the manifest
really does list `card.inc` and `badge.toggle` twice.

Not fixed here. Giving the agent a way to name an instance means putting the key in
the tool name (`card#2.inc`), which changes the wire format the manifest, the WebMCP
descriptors, the copilot loop and the docs all agree on — a design decision, not a
hardening fix. The resolution rule is pinned in
`packages/conformance/security/bridge-call.cases.ts` so it is a known contract
rather than an accident.

### A proposal is not bound to whoever it was created for

`POST /_janux/approve` looks a pending proposal up by id in a server-wide map and
executes it. The ids are now unguessable (`crypto.randomUUID`), which removes the
exploit that mattered — while they were a shared counter, `{"id":"prop_api_3"}`
approved somebody else's `confirm`-guarded call, defeating the guard system with a
small integer. But nothing *ties* a proposal to a session, so a leaked id is still
a bearer token for that one call.

Closing it properly needs a notion of "who": Janux has `ctx` (whatever
`ctxFor` resolves, plus a Web Bot Auth agent identity) and no user or session model
of its own. An app that needs per-user isolation should carry an identity in `ctx`
and check it in a `middleware` around `/_janux/approve`. Inventing a session
concept inside the framework to fix this is a design decision, not a patch.

### `forbidden` only blocks the agent face

`resolveGuard` returning `forbidden` refuses `origin === 'agent'`; a human click and
an RPC call with no `x-janux-origin: agent` header still run the intent. That is
deliberate — `forbidden` means "not part of the agent surface", and the manifest
omits it entirely — but the name reads stronger than it is. An intent no one should
run, ever, needs its own check inside `run()`. Pinned in
`packages/conformance/agent-surface/guards.cases.ts`.

### `setQueryData` on a key that was never fetched is a no-op

`client.setQueryData(['k'], v)` before anything created the entry drops the write
silently, so seeding the cache ahead of the first fetch — a normal optimistic-update
path — leaves `getQueryData` returning `undefined`. Pinned in
`packages/conformance/cache/client.cases.ts` so the behaviour is at least known.

Not fixed because the obvious fix is worse than the bug. Creating an entry needs a
`queryFn`, and the only one available is `async () => data` — a lie. `getQuery`
returns the *existing* query and ignores the new options, so a real `useQuery`
mounting later would inherit that synthetic function and never refetch: a silent
"stale forever" bug in place of a silent dropped write. Doing it properly means
deciding how `getQuery` reconciles the options of a second observer (TanStack lets
the latest observer update them), which is a design decision about the observer
model rather than a patch.

### SVG namespaced attributes are silently dropped

`VALID_ATTR_NAME` (`/^[a-zA-Z][\w-]*$/`) rejects any name containing a colon, so
`xlink:href`, `xmlns:xlink` and friends never reach the output — silently, which
is the bad part. The validation itself is load-bearing: it is what stops an
attacker-supplied prop name from injecting markup, and it is asserted by several
corpus rows.

Widening it correctly means allowing exactly the XML namespace shape
(`NCName ":" NCName`) rather than any colon, and deciding whether Janux renders
SVG as a first-class tree at all. That is a design decision with a real surface,
not a regex tweak, and no example or doc page uses SVG namespaced attributes
today — so it is recorded here rather than guessed at.
