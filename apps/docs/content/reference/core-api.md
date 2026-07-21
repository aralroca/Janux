# Core API

Everything importable from `janux`.

## component(def)

Defines a bifacial component. Returns a frozen `ComponentDef`.

| Key | Type | Notes |
|---|---|---|
| `name` | `string` (kebab-case, required) | Resource uri becomes `ui://<name>` |
| `description` | `string` | Shown to agents in the manifest — write it for them |
| `state` | `schema({...})` | Serializable by construction; powers snapshots & resume |
| `derived` | `Record<string, (state) => unknown>` | Computed values, cached reactively |
| `sources` | `Record<string, source(...)>` | Declarative async data-in |
| `effects` | `Record<string, effect(...)>` | Named side effects with declared triggers |
| `intents` | `Record<string, intent(...)>` | The tools; also the click handlers |
| `emits` | `Record<string, schema>` | Typed events this component may emit |
| `on` | `Record<string, (bag) => void>` | Event subscriptions (component, store or server events) |
| `lifecycle` | `{ attach?, detach? }` | Mount = publish capabilities; detach awaits cleanup |
| `use` | `Record<string, StoreDef>` | Declared store dependencies |
| `view` | `(bag) => JSX` (required) | The human face — agents never see it |

The `bag` passed to `view`, `run`, `ready`, lifecycle and `on` handlers:

```ts
{ state, derived, sources, intents, use, emit, ctx, input?, event? }
```

## store(def)

Same as `component` minus `view`. Projects as `store://<name>`. `scope: 'app' | 'route'` (default `'app'`).

## intent(def)

| Key | Type | Notes |
|---|---|---|
| `description` | `string` | The agent reads this — make it actionable |
| `input` | `schema({...})` | Validated before `run`; errors carry paths |
| `guard` | `'auto' \| 'confirm' \| 'forbidden'` or `({ ctx }) => guard` | Default `'auto'` |
| `ready` | `(bag) => boolean` | Announced in the manifest; not-ready calls throw `not_ready` |
| `run` | `(bag) => unknown` (required) | The only place `state` may be mutated |

Invocation results for agent-origin calls with `guard: 'confirm'` are proposals: `{ status: 'proposal', id, tool, input }`.

## effect(def)

`{ description?, when?: (state) => slice, debounce?: '300ms', run: (bag) => cleanup | Promise }`

Runs on attach and whenever the `when` slice changes. `run` may return a cleanup function. Durations: `ms`, `s`, `m`, `h`.

## source(def) / every() / onEvent()

```ts
source({ description, query: ({ ctx }) => data, refresh: every('5m').orOn('inventory.changed') })
```

Readers expose `.value`, `.pending`, `.error`, `.refresh()`. On SSR sources load before render and their values travel in the snapshot — resumed islands never double-fetch.

## Signals (advanced)

`signal(initial)`, `computed(fn)`, `watch(fn)` (effect; returns dispose), `batch(fn)`, `untrack(fn)`. You rarely need these directly — state, derived and effects cover the usual cases.

## createInstance(def, options) (advanced)

The runtime beneath islands — also your unit-testing entry point. See the [Testing recipe](/docs/recipes/testing-components).

```ts
const cart = createInstance(Cart, { initial, ctx, bus, stores, onAudit, onProposal });
await cart.attach();          // starts sources, effects, lifecycle
await cart.intents.addItem({ productId: 'p1' });          // human origin
await cart.intents.addItem({ productId: 'p1' }, { origin: 'agent' });
await cart.settled();
cart.snapshot();              // plain JSON state
cart.resource();              // the agent projection
await cart.dispose();
```
