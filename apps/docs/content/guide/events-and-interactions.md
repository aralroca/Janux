---
title: Events and interactions
description: "Events use the names you already know, with one deliberate difference: the value is a named intent, never an anonymous closure."
---

# Events and interactions

Events use the names you already know — `onClick`, `onSubmit`, `onInput`, `onDoubleClick`, any DOM event — with one deliberate difference: **the value is an intent, never a closure**. There is no anonymous `onClick={() => ...}` (it is a compile-time error) — a handler is always a named, schema-typed, guard-checked intent, and delegated listeners on `document` do all the work. No component code runs until the first interaction.

## Coming from React

| React | Janux | Why |
|---|---|---|
| `onClick={() => add(p.id)}` | `onClick={intents.add.with({ id: p.id })}` | The click *is* a tool call — same pipeline agents use |
| `onSubmit={fn}` + controlled inputs | `<form onSubmit={intents.x}>` — fields become the input object | Schema-validated at the boundary, works before JS loads the island |
| `onChange` / controlled `value` | `<input value={state.q} onInput={intents.setQ} />` | Controlled inputs, IME-safe, still intent-typed |
| `onKeyDown={fn}` | `onKeyDown={intents.onKey}` — intent receives `{ key, code, …modifiers }` | Keyboard handling without eager listeners |
| Hover *styling* | CSS `:hover` / `:focus-visible`; `onMouseEnter={intents.x}` only when state must change | Styling never needed JavaScript |
| Callback props (`onDone={...}`) | `emits:` + `on:` typed events | One bus, both audiences — agents can subscribe too |

The deeper difference: a React handler is an anonymous closure only the human path can reach. A Janux intent is **named, schema-typed, guard-checked and audited** — and the button's click, the keystroke and the copilot's tool call run exactly the same code.

## Any event, one rule

`on` + the event name, value = intent. The prop compiles to a marker — an attribute, not a listener — so resumability is intact: the island mounts on first interaction.

| JSX prop | DOM event | HTML marker |
|---|---|---|
| `onClick` | `click` | `data-jxa` |
| `onSubmit` (on a `<form>`) | `submit` | `data-jxform` |
| `onDoubleClick` / `onDblClick` | `dblclick` | `data-jxe-dblclick` |
| `onFocus` / `onBlur` | `focusin` / `focusout` (the bubbling variants) | `data-jxe-focusin` / `-focusout` |
| any other `on<Event>` | the event, lowercased | `data-jxe-<event>` |

A listener installs once per document **per event type actually used** — a page that never binds `onWheel` never listens for `wheel`. Events that don't bubble (`onMouseEnter`, `onScroll`, `onToggle`, …) delegate through the capture phase, so they work like everything else. And the whole `on*` namespace is reserved: a plain function (no intent) or a string (`onclick="…"`) never reaches the markup.

Also part of the interaction surface:

- **Component events**: `emits:` / `on:` (see [Sources, effects and events](/docs/guide/sources-effects-events)).
- **Runtime DOM events**: `janux:tool-call`, `janux:proposal`, `janux:navigate`, `janux:error` (see [Client API](/docs/reference/client-api)).

## Binding input: `.with()` and `data-input`

A list renders many controls onto one intent; `.with()` declares which row each control means:

```tsx
{products.map((product) => (
  <button onClick={intents.add.with({ productId: product.id })}>Add</button>
))}
```

`.with(input)` returns a bound ref — same intent, same marker — and the renderer serializes the input into the control's `data-input` for you. The input must be JSON-serializable, the intent's schema still validates it at invocation, and `.with()` chains (later keys win). Writing `data-input='{"productId":"p1"}'` by hand still works, and wins over `.with()` when both are present.

The intent's input is derived from the event and merged under the bound input (which wins on conflict):

| Event | Facts delivered to the intent |
|---|---|
| `onInput` / `onChange` | `{ value }` — the control's value (`checked` for checkbox/radio) |
| `onKeyDown` / `onKeyUp` | `{ key, code, altKey, ctrlKey, metaKey, shiftKey }` |
| mouse family (`onPointerDown`, `onDoubleClick`, `onDrop`, …) | `{ x, y }` (client coordinates) |
| `onSubmit` | the form's fields, as an object |
| `onFocus` / `onBlur` on a form control | `{ value }` |
| everything else | `{}` (plus your bound input, if any) |

Unknown keys are stripped by the intent's input schema, so declare only what you consume.

## The native event

An intent never receives the raw `Event` object, and that is the point: the same intent is a tool an agent invokes with a JSON input, and in *that* call there is no DOM event. If `run()` depended on a native event, it would work on click and break (or diverge) under an agent — and an `Event` isn't serializable, so it could never ride the static marker that makes pages resumable. What crosses the boundary is the table above: **facts derived from the event**, merged with what you bind via `.with()`.

When you genuinely need something only the native event has (`relatedTarget` on a blur, `clipboardData`, fine-grained `preventDefault`), wire that trigger yourself in `lifecycle.attach` and extract what you need before calling the intent — the mutation still goes through a named, validated, agent-visible action:

```tsx
lifecycle: {
  attach: ({ intents }) => {
    const onBlur = (event: FocusEvent) => {
      const goingTo = (event.relatedTarget as HTMLElement)?.id ?? null;

      intents.leaveField({ goingTo });
    };
    const field = document.querySelector('#email')!;

    field.addEventListener('blur', onBlur);

    return () => field.removeEventListener('blur', onBlur);
  },
},
```

## Drag & drop

HTML5 drag & drop is two intents and no listener code. The trick the platform normally makes you write — `event.preventDefault()` on `dragover`, or `drop` never fires — is done by the runtime: **binding `onDrop` declares the zone, and the runtime enables it**.

```tsx
export const Board = component({
  name: 'board',
  state: schema({ dragging: str().default(''), done: list({ id: str() }) }),
  intents: {
    pick: intent({
      description: 'Start dragging a card',
      input: schema({ card: str() }),
      run: ({ state, input }) => (state.dragging = input.card),
    }),
    dropOn: intent({
      description: 'Move the dragged card into a column',
      input: schema({ column: str() }),
      run: ({ state, input }) => {
        if (state.dragging) state.done.push({ id: state.dragging });
        state.dragging = '';
      },
    }),
  },
  view: ({ state, intents }) => (
    <div class="board">
      {cards.map((card) => (
        <article draggable="true" onDragStart={intents.pick.with({ card: card.id })}>
          {card.title}
        </article>
      ))}
      <section class="column" onDrop={intents.dropOn.with({ column: 'done' })}>
        Done
      </section>
    </div>
  ),
});
```

The payload travels through **island state**, not `dataTransfer`: `onDragStart` records *what* is being dragged (`.with()` says which card each element means), `onDrop` reads it back. That keeps the whole gesture on the agent surface — `board.pick` and `board.dropOn` are ordinary tools, so a copilot can move the card with two calls and no mouse. The runtime also cancels the browser's default drop handling (navigating to a dragged link), and the drop intent receives `{ x, y }` for position-sensitive targets.

Two escape hatches, when you need them:

- **Pointer-based DnD** (custom ghosts, touch support): `onPointerDown` / `onPointerMove` / `onPointerUp` are ordinary delegated events with `{ x, y }` — same state-carrying pattern.
- **Real `dataTransfer`** (files dropped from the OS, dragging out of the page): that data only exists on the native event, so wire those specific listeners in `lifecycle.attach` (see [The native event](#the-native-event)) and hand the extracted result to an intent.

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

## Human vs. agent behavior

The same intent serves two callers, and `run()` can tell them apart: `origin` is `'human'` for a DOM interaction and `'agent'` for any call through the agent surface (the bridge, WebMCP, hosted MCP, `/_janux/api`). Guards see it too — the canonical pattern runs instantly for people and asks for approval when an agent calls:

```tsx
save: intent({
  description: 'Persist the draft',
  guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'),
  run: ({ state, origin }) => {
    state.savedBy = origin; // 'human' | 'agent'
  },
}),
```

The manifest advertises the guard **as the agent sees it** (`confirm` here), so an agent knows the call will propose rather than execute. `api()` tools get the same two signals: `run(({ input, ctx, origin }) => …)` and origin-aware guards, with the caller identified by the `x-janux-origin` header.

Approving a proposal executes it **with the agent origin** — the call came through the agent surface; the human only authorized it — and the execution lands in the audit trail alongside its `proposed` entry. `/_janux/approve` and `/_janux/reject` refuse callers identifying as agents: a proposal is settled by a human, never by its proposer.

**Trust model, stated plainly:** `origin` distinguishes Janux's own agent surface from DOM interaction — it is a UX and governance signal, not an anti-automation mechanism. An external driver clicking real DOM (Playwright, a computer-use agent) reads as `'human'`; agents that identify themselves cryptographically are a separate, stronger signal ([Web Bot Auth](/docs/reference/server-api), surfaced as `ctx.agent`).

## Visualizing agent activity: the glow

Janux ships the gui-agent-style highlight: while an agent operates an island, it glows.

```ts title="src/client.ts"
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

Glow alone — the ring tours every element the agent touches:

<video autoplay muted loop playsinline controls preload="metadata" poster="/agent-feedback-glow-poster.jpg" aria-label="The console operated by an agent with only the glow enabled: a ring highlights each control as the matching tool call runs">
  <source src="/agent-feedback-glow.webm" type="video/webm" />
  <source src="/agent-feedback-glow.mp4" type="video/mp4" />
</video>

### The simulated cursor

`cursor: true` (or `{ duration }`) adds a second layer: a simulated cursor that travels the screen element to element as the agent acts, starting from the center of the viewport on its first move. Glow and cursor consume the same events and combine freely — both, either, or neither:

```ts title="src/client.ts"
boot({ defs: [Cart], glow: true, cursor: true });
```

Like the glow, its look is yours via CSS custom properties (the overlay is `#janux-agent-cursor`):

```css
:root {
  --janux-cursor-fill: #fff;                      /* arrow fill */
  --janux-cursor-ring: rgba(124, 58, 237, 0.9);   /* arrow outline */
  --janux-cursor-halo: rgba(34, 211, 238, 0.65);  /* glow around the arrow */
  --janux-cursor-size: 26px;
  --janux-cursor-travel: 0.6s;                    /* travel time between elements */
}
```

Lower-level: `enableAgentCursor(options)` (returns a disposer), `moveCursorTo(el, duration)`, `injectCursorStyles()` and the `CURSOR_ID` constant.

Cursor alone — the arrow travels element to element as the agent acts:

<video autoplay muted loop playsinline controls preload="metadata" poster="/agent-feedback-cursor-poster.jpg" aria-label="The console operated by an agent with only the simulated cursor enabled: an arrow travels the screen to each control as the matching tool call runs">
  <source src="/agent-feedback-cursor.webm" type="video/webm" />
  <source src="/agent-feedback-cursor.mp4" type="video/mp4" />
</video>

And the default pairing — glow and cursor together:

<video autoplay muted loop playsinline controls preload="metadata" poster="/agent-feedback-glow-cursor-poster.jpg" aria-label="The console operated by an agent with glow and simulated cursor enabled together: the arrow travels to each control while the ring highlights it">
  <source src="/agent-feedback-glow-cursor.webm" type="video/webm" />
  <source src="/agent-feedback-glow-cursor.mp4" type="video/mp4" />
</video>

### One seam, any feedback layer

Two DOM events carry everything a visualization needs, and the runtime never hardcodes the pixels:

| Event | Fired when | Detail |
|---|---|---|
| `janux:tool-call` | Around every bridge call | `{ tool, input, phase, guard, approval }`, plus `glowTargetPending` on `start` and the resolved [`glowTarget`](/docs/reference/core-api) on `ok` |
| `janux:tool-target` | Just before a DOM-fallback tool (`ui_click`, `ui_fill`) acts | `{ element, action, selector }` |

The built-in glow is simply the default consumer of both. Anything richer — status chips, an animated ring, a backdrop veil — listens to the same two events instead of replacing them, which is what [`createCopilot({ visualize })`](/docs/recipes/local-model-copilot) does.

> **Tip:** try it in the [Playground](/playground) — the agent panel has "✨ Glow" and "🖱️ cursor" checkboxes (both on by default); call any tool and watch the preview.
