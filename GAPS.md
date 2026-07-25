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
