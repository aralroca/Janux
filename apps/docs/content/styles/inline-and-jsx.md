# Inline and JSX styles

The `class` and `style` attributes are plain HTML attributes in Janux — there is no `className`, and no CSS-in-JS runtime. What the framework adds is types.

## `class`

`class` takes a string, so every ordinary JavaScript expression works. Conditional looks are conditional strings:

```tsx
import { bool, component, intent, schema } from 'janux';

export const Toggle = component({
  name: 'toggle',
  description: 'A pill that switches between two looks.',
  state: schema({ on: bool().default(false) }),
  intents: {
    flip: intent({ description: 'Flip the switch.', run: ({ state }) => (state.on = !state.on) }),
  },
  view: ({ state, intents }) => (
    <button class={state.on ? 'pill pill-on' : 'pill'} onClick={intents.flip}>
      {state.on ? 'On' : 'Off'}
    </button>
  ),
});
```

Because the view re-runs when state changes, and the runtime morphs the DOM in place, the class attribute is simply recomputed — there is no `classList` bookkeeping to write.

For anything longer than a ternary, name the mapping instead of nesting conditionals in the JSX:

```tsx
const TONE = { idle: 'chip', busy: 'chip chip-busy', failed: 'chip chip-failed' };

// in the view:
<span class={TONE[state.status]}>{state.status}</span>
```

## `style`

`style` accepts either CSS text or a typed object:

```tsx
<div style="color: red; width: 10px" />

<div style={{ color: 'red', width: '10px' }} />
```

The object form is typed with `CSSProperties`: properties are camelCased (`backgroundColor`, `borderRadius`) and their values are checked, so a typo is a compile error rather than a rule the browser silently drops.

Custom properties are allowed alongside them, which is what makes [runtime theming](/docs/styles/css-variables) type-safe:

```tsx
<section style={{ backgroundColor: '#fff', '--brand': '#0062ff' }} />
```

## When to use which

Inline styles win exactly once: when the value is something the stylesheet cannot know.

```tsx
// Good: the number comes from data, not from the design.
<div class="bar" style={{ width: `${percent}%` }} />
```

Everything else belongs in a class. An inline style has the highest specificity short of `!important`, so a page that reaches for it by habit becomes a page where the stylesheet no longer decides anything. It also cannot express hover, focus, media queries or `prefers-color-scheme`.

The middle path — and usually the right one — is to let the class do the styling and the inline style carry only the *value*:

```tsx
<div class="meter" style={{ '--fill': `${percent}%` }} />
```

```css
.meter::after {
  width: var(--fill);
  transition: width 200ms ease;
}
```

Now the look lives in CSS, where hover states and media queries are available, and the component contributes one number.
