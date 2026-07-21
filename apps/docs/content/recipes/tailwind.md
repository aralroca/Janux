# Tailwind CSS

First-class Tailwind v4, zero config — installing the package **is** the configuration (Janux apps have no `vite.config` to edit):

```bash
bun add @janux/tailwind
```

```css
/* src/styles.css */
@import "@janux/tailwind";

/* your own CSS can live below, as usual */
```

That's it. Use utilities anywhere in your views:

```tsx live
import { component, intent, schema, int } from 'janux';

export const Counter = component({
  name: 'counter',
  state: schema({ count: int() }),
  intents: {
    inc: intent({ description: 'Increment', run: ({ state }) => (state.count += 1) }),
  },
  view: ({ state, intents }) => (
    <section class="flex flex-col items-center gap-4 pt-16 font-sans">
      <h1 class="text-5xl font-extrabold text-indigo-950">{state.count}</h1>
      <button on={intents.inc} class="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-2 font-bold text-white shadow-lg">
        +1
      </button>
    </section>
  ),
});
```

## How it works

- The CLI detects `@janux/tailwind` and wires the official `@tailwindcss/postcss` plugin into `janux dev` and `janux build`. The postcss pipeline processes the directly-linked `src/styles.css`, so **fully static apps keep shipping 0 KB of JS** — Tailwind is just CSS.
- `@import "@janux/tailwind"` (rather than `"tailwindcss"`) exists so imports resolve without adding Tailwind to your own dependencies.
- `janux build` compiles the stylesheet with content scanning to `dist/client/styles.css` — only the utilities you actually use ship.
- Custom theme? Standard Tailwind v4 CSS-first config in your stylesheet: `@theme { --color-brand: #7c3aed; }`.

## In the playground

The [Playground](/playground) compiles utilities at runtime with `@tailwindcss/browser`, so every example (and anything you type) can use Tailwind classes live — dynamic classes added by re-renders included.

> **Note:** the runtime compiler is a playground convenience. Real apps get the build-time pipeline above: zero runtime cost, purged output.
