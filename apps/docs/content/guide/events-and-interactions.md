# Events and interactions

If you come from React, this is the page to read twice: **Janux event props resolve to intents, not closures**. There is no anonymous `onClick={() => ...}` — a handler is always a named, schema-typed, guard-checked intent, and delegated listeners on `document` do all the work. No component code runs until the first interaction.

## Coming from React

| React | Janux | Why |
|---|---|---|
| `onClick={fn}` | `<button on={intents.x} data-input='{"id":"p1"}'>` | The click *is* a tool call — same pipeline agents use |
| `onSubmit={fn}` + controlled inputs | `<form intent={intents.x}>` — fields become the input object | Schema-validated at the boundary, works before JS loads the island |
| `onChange` / controlled `value` | `<input value={state.q} onInput={intents.setQ} />` | Controlled inputs, IME-safe, still intent-typed |
| `onKeyDown={fn}` | `onKeyDown={intents.onKey}` — intent receives `{ key, code, …modifiers }` | Keyboard handling without eager listeners |
| `onMouseEnter` / hover styling | CSS `:hover` / `:focus-visible` | It never needed JavaScript |
| Callback props (`onDone={...}`) | `emits:` + `on:` typed events | One bus, both audiences — agents can subscribe too |

The deeper difference: a React handler is an anonymous closure only the human path can reach. A Janux intent is **named, schema-typed, guard-checked and audited** — and the button's click, the keystroke and the copilot's tool call run exactly the same code.

## The delegated event surface

Every handler prop compiles to a `data-jxe-*` marker — an attribute, not a listener — so resumability is intact: the island mounts on first interaction.

- **Click**: `on={intents.x}`; optional `data-input` JSON becomes the input.
- **Submit**: `<form intent={intents.x}>`; form fields become the input object.
- **Rich events** (delegated at `document` level): `onInput`, `onChange`, `onKeyDown`, `onKeyUp`, `onFocus`, `onBlur`, `onPointerDown`, `onPointerUp`.
- **Component events**: `emits:` / `on:` (see [Sources, effects and events](/docs/guide/sources-effects-events)).
- **Runtime DOM events**: `janux:tool-call`, `janux:proposal`, `janux:navigate`, `janux:error` (see [Client API](/docs/reference/client-api)).

The intent's input is derived from the event and merged under `data-input` (which wins on conflict):

| Event | Facts delivered to the intent |
|---|---|
| `onInput` / `onChange` | `{ value }` — the control's value (`checked` for checkbox/radio) |
| `onKeyDown` / `onKeyUp` | `{ key, code, altKey, ctrlKey, metaKey, shiftKey }` |
| `onPointerDown` / `onPointerUp` | `{ x, y }` (client coordinates) |
| `onFocus` / `onBlur` | `{}` (plus your `data-input`, if any) |

Unknown keys are stripped by the intent's input schema, so declare only what you consume.

## Controlled inputs

Bind state to `value` and write back with an intent:

```tsx
export const Search = component({
  name: 'search',
  state: schema({ q: str().default('') }),
  intents: {
    setQ: intent({
      input: schema({ value: str() }),
      run: ({ state, input }) => (state.q = input.value),
    }),
  },
  view: ({ state, intents }) => (
    <input value={state.q} onInput={intents.setQ} />
  ),
});
```

Guarantees:

- **No cursor jumps** — re-renders never write to the focused control; every other binding of the same state updates live.
- **IME-safe** — input events fired mid-composition are suppressed; the composed text commits once on `compositionend`, so multi-byte input is never clobbered.
- **Agent-visible** — the input's value is island state: an agent reads it as a resource and can set it through the same `setQ` intent the keyboard uses.

Need `dblclick` or drag today? Attach a plain listener in `lifecycle.attach` and call your own intents from it — interactions still end up as intents, you just wire the trigger yourself.

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

Lower-level pieces are exported from `janux/client` if you want custom behavior: `enableAgentGlow(options)` (returns a disposer), `glowElement(el, duration)`, `glowTargetFor(tool)`, `injectGlowStyles()` and the `GLOW_CLASS` constant.

### One seam, any feedback layer

Two DOM events carry everything a visualization needs, and the runtime never hardcodes the pixels:

| Event | Fired when | Detail |
|---|---|---|
| `janux:tool-call` | Around every bridge call | `{ tool, input, phase, guard, approval }`, plus `glowTargetPending` on `start` and the resolved [`glowTarget`](/docs/reference/core-api) on `ok` |
| `janux:tool-target` | Just before a DOM-fallback tool (`ui_click`, `ui_fill`) acts | `{ element, action, selector }` |

The built-in glow is simply the default consumer of both. Anything richer — status chips, an animated ring, a backdrop veil — listens to the same two events instead of replacing them, which is what [`createCopilot({ visualize })`](/docs/recipes/local-model-copilot) does.

> **Tip:** try it in the [Playground](/playground) — the agent panel has a "✨ Glow" checkbox; call any tool and watch the preview.
