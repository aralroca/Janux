# Events and interactions

If you come from React, this is the page to read twice: **Janux has no per-element event props**. No `onClick`, no `onDoubleClick`, no `onMouseEnter`. Interaction is declared as *intents*, and two delegated listeners on `document` do all the work.

## Coming from React

| React | Janux | Why |
|---|---|---|
| `onClick={fn}` | `<button on={intents.x} data-input='{"id":"p1"}'>` | The click *is* a tool call — same pipeline agents use |
| `onSubmit={fn}` + controlled inputs | `<form intent={intents.x}>` — fields become the input object | Schema-validated at the boundary, works before JS loads the island |
| `onChange` / controlled `value` | Uncontrolled inputs, read at submit | Keystroke-level state is presentational noise agents don't need |
| `onMouseEnter` / `onFocus` for styling | CSS `:hover` / `:focus-visible` | It never needed JavaScript |
| `onDoubleClick`, `onKeyDown`, drag… | Not built in (see below) | v0.x keeps the delegated surface tiny: click + submit |
| Callback props (`onDone={...}`) | `emits:` + `on:` typed events | One bus, both audiences — agents can subscribe too |

The deeper difference: a React handler is an anonymous closure only the human path can reach. A Janux intent is **named, schema-typed, guard-checked and audited** — and the button's click and the copilot's tool call run exactly the same code.

## What exists today

- **Click**: `on={intents.x}` on any element; optional `data-input` JSON becomes the input.
- **Submit**: `<form intent={intents.x}>`; form fields become the input object.
- **Component events**: `emits:` / `on:` (see [Sources, effects and events](/docs/guide/sources-effects-events)).
- **Runtime DOM events**: `janux:tool-call`, `janux:proposal`, `janux:navigate`, `janux:error` (see [Client API](/docs/reference/client-api)).

Need `dblclick`, `keydown` or drag today? Attach a plain listener in `lifecycle.attach` and call your own intents from it — interactions still end up as intents, you just wire the trigger yourself. Richer declarative triggers are on the roadmap.

## Visualizing agent activity: the glow

Janux ships the gui-agent-style highlight: while an agent operates an island, it glows.

```ts
// src/client.ts
boot({ defs: [Cart], glow: true });          // or { glow: { duration: 1200 } }
```

Every `window.janux.call(...)` (your copilot, an external client, the playground) makes the target island glow from `start` until shortly after the call resolves. Humans always see *where* the agent is acting — proposals stop being abstract.

Styling is yours via CSS custom properties:

```css
janux-island {
  --janux-glow-ring: rgba(124, 58, 237, 0.55);   /* inner ring */
  --janux-glow-halo: rgba(34, 211, 238, 0.35);   /* outer halo */
  --janux-glow-spread: 34px;
  --janux-glow-radius: 18px;
}
```

Lower-level pieces are exported from `janux/client` if you want custom behavior: `enableAgentGlow(options)` (returns a disposer), `glowElement(el, duration)`, `injectGlowStyles()` and the `GLOW_CLASS` constant.

> **Tip:** try it in the [Playground](/playground) — the agent panel has a "✨ Glow" checkbox; call any tool and watch the preview.
