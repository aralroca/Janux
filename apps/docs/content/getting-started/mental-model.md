# Mental model

Four ideas carry the whole framework. Learn these and the rest of the docs is detail.

## 1. One definition, three projections

A `component({...})` is not a function that returns markup. It's a **declaration** the runtime projects three ways:

| Projection | Who consumes it | Where it shows up |
|---|---|---|
| **View** | Humans | Server-rendered HTML, resumed on interaction |
| **Resource** | Agents (read) | `ui://counter` — plain JSON state + derived |
| **Tools** | Agents *and* humans | `counter.inc` with JSON Schema input + guard |

The view is a *projection*, not the source of truth — which is why adding an intent instantly gives agents a new capability, and why the two audiences can never diverge.

## 2. State is typed, and only intents mutate it

State is declared with [`schema`](/docs/reference/schema-api), not inferred from initial values. Every mutation goes through a named [`intent`](/docs/guide/intents-and-guards) whose input is validated — there is no `setState` you can call from anywhere.

```tsx
state: schema({ count: int() }),
intents: {
  inc: intent({ input: schema({ by: int().default(1) }), run: ({ state, input }) => (state.count += input.by) }),
},
```

That restriction is what buys the agent surface: every state transition is named, validated, guarded and auditable — identical whether a human clicked or a model called. Direct writes outside a `run()` throw.

**Corollary:** `run()` receives everything it needs in its bag (`state`, `input`, `ctx`, `emit`, `use`). It must not close over outer variables to mutate state — the definition has to be fully describable, or the projection would lie.

## 3. Islands resume; they don't hydrate

A page is server-rendered HTML. Components with state become **islands**: their state is serialized as a JSON snapshot, and the component's code loads *on first interaction*, restoring from that snapshot. Nothing re-renders on load, no closure is serialized, no effect is replayed. A page with no islands ships **0 KB** of JavaScript.

Mark an island `eager` when it must be live on arrival (an editor, an event listener), and `persist` when its live instance must survive navigation.

## 4. Guards are the contract with agents

Each intent (and each `api()`) declares who may run it and whether a human must approve:

| Guard | Human | Agent |
|---|---|---|
| `auto` (default) | runs | runs |
| `confirm` | runs | returns a **proposal** a human approves |
| `forbidden` | runs | rejected |

Guards resolve per request origin, server-side. This is how you let a copilot fill a cart but never check out unattended.

## Where things live

**Islands are ephemeral, stores and the server are durable.** State that must outlive a navigation belongs in a [store](/docs/guide/stores) (or on the server), not in a route island. Put it there and it survives; leave it in a route island and it re-resumes fresh from the incoming page — by design, not by accident.

## Coming from React?

| React | Janux |
|---|---|
| `useState` + setters | `state: schema({...})` + `intents` |
| `useMemo` / derived render | `derived: { total: (s) => ... }` |
| `useEffect` + deps array | `effect({ when: (s) => s.items, debounce: '300ms', run })` |
| Context / a store library | `store({ name, scope: 'app' })` + `use: { theme }` |
| Data fetching hooks | `source({ query, refresh: every('5m') })` or [`useQuery`](/docs/guide/data-cache) |
| `<Link>` | a plain `<a href>` — [navigation](/docs/guide/navigation) is automatic |
| An MCP integration you write | generated |

Real React components still work — mount them unchanged with [`foreign()`](/docs/guide/interop) when you need the ecosystem.

Next: [Editor setup](/docs/getting-started/editor-setup) · [Components](/docs/guide/components)
