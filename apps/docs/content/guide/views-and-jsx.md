# Views and JSX

A `view` is a pure function of the bag it receives (`{ state, derived, intents, use, ctx, children }`) returning JSX. It runs on the server for the initial HTML and again on the client when the island re-renders. This page is the complete prop surface — what JSX accepts and exactly what it becomes in HTML.

```tsx
view: ({ state, intents }) => (
  <section class="cart">
    <h2>{state.items.length} items</h2>
    <button on={intents.checkout}>Pay</button>
  </section>
),
```

## Attributes

| You write | HTML output | Notes |
|---|---|---|
| `class="x"` or `className="x"` | `class="x"` | Both spellings work and mean the same thing. |
| `disabled={true}` | `disabled` | Boolean attribute, no value. |
| `disabled={false}` | *(omitted)* | So are `null` and `undefined` — no `="false"` ever renders. |
| `data-team={params.team}` | `data-team="acme"` | Any valid attribute name passes through, escaped. |
| `style="color:red"` | `style="color:red"` | Styles are a string; there is no object form. |
| `onClick={fn}` | *(dropped)* | Plain function props are not serialized — wire behavior through intents (below). |

Attribute names must match `/^[a-zA-Z][\w-]*$/`; anything else is dropped rather than emitting invalid HTML. Values are HTML-escaped, so interpolated user content is safe by default.

## Wiring behavior: intents, not handlers

There are no inline event handlers. You bind an **intent**, and the runtime delegates the event — which is what keeps a page resumable (no listener needs to exist before the first interaction).

```tsx
<button on={intents.inc}>+1</button>                    {/* click */}
<form intent={intents.save}>…</form>                    {/* submit, with form fields as input */}
<input onInput={intents.filter} value={state.query} />   {/* rich events */}
```

| Prop | Fires on | Marker emitted |
|---|---|---|
| `on` | click | `data-jxa` |
| `intent` | form submit | `data-jxform` |
| `onInput` | input | `data-jxe-input` |
| `onChange` | change | `data-jxe-change` |
| `onKeyDown` / `onKeyUp` | keydown / keyup | `data-jxe-keydown` / `-keyup` |
| `onFocus` / `onBlur` | focusin / focusout | `data-jxe-focusin` / `-focusout` |
| `onPointerDown` / `onPointerUp` | pointerdown / pointerup | `data-jxe-pointerdown` / `-pointerup` |

Focus and blur map to the **bubbling** variants (`focusin`/`focusout`) on purpose: delegation from the document root requires events that bubble. See [Events and interactions](/docs/guide/events-and-interactions) for the delegation model and controlled inputs.

## Fragments, conditionals and children

```tsx
view: ({ state, children }) => (
  <>
    {state.error ? <p class="error">{state.error}</p> : null}
    {state.items.map((item) => <li key={item.id}>{item.name}</li>)}
    {children}
  </>
),
```

- **Fragments** — `<>…</>` groups siblings without a wrapper element.
- **Conditionals** — a plain ternary. `null`, `undefined`, `false` and `true` render nothing.
- **Lists** — `Array.prototype.map`. Give elements a `key` when the list can reorder ([keys and lists](/docs/guide/keys-and-lists)).
- **`children`** — whatever the call site passed, already rendered.

Numbers and strings render as text; objects don't (pass a string). Void elements (`img`, `input`, `br`, `hr`, `meta`, `link`, …) never get a closing tag.

## Raw HTML: dangerHTML

For content you already trust as HTML — a rendered Markdown body, a sanitized rich-text field:

```tsx
<div dangerHTML={renderedMarkdown} />
```

It replaces the element's children and, as the name says, is **not** escaped. Never pass user input through it without sanitizing first.

## Props with framework meaning

These are consumed by the runtime rather than emitted as attributes:

| Prop | On | Effect |
|---|---|---|
| `key` | any island | Distinguishes sibling instances of the same component — [keys and lists](/docs/guide/keys-and-lists) |
| `eager` | island | Mounts on arrival instead of on first interaction |
| `persist` | island | The live instance survives navigation |
| `data-native` | `<a>` | Opts the link out of SPA navigation ([navigation](/docs/guide/navigation)) |

## Links are localized for you

When [i18n](/docs/guide/i18n) is configured, an `<a>` whose `href` starts with `/` is rewritten to the active locale (`/about` → `/es/about`). Already-prefixed hrefs are left alone, and `/_janux/*` endpoints are never touched. External and hash links pass through untouched.

Related: [Components](/docs/guide/components) · [Events and interactions](/docs/guide/events-and-interactions) · [Keys and lists](/docs/guide/keys-and-lists)
