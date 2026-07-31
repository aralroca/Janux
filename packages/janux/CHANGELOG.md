# janux

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
