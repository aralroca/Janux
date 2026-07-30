# CSS variables

Sass resolves at build time. Tailwind ships utilities. Custom properties are the third option, and the only one whose values can still change once the page is live — which makes them the mechanism for themes, densities and anything else a user picks.

Runnable version of this page: [`examples/with-css-variables`](https://github.com/aralroca/Janux/tree/main/examples/with-css-variables).

## Declare defaults, read them everywhere

```css
/* src/styles.css */
:root {
  --brand: #0062ff;
  --pad: 1.25rem;
  --radius: 1rem;
}

.cta {
  padding: 0.55rem 1.1rem;
  border-radius: var(--radius);
  background: var(--brand);
  color: #fff;
}

.preview {
  padding: var(--pad);
  border-left: 4px solid var(--brand);
  border-radius: var(--radius);
}
```

Not one of those rules names a colour. They name a *variable*, which is what lets something else decide the value later.

## Let state write the values

An island renders the properties onto a wrapper, and the cascade repaints everything inside it:

```tsx
import { component, enums, intent, schema } from 'janux';

const BRANDS = { ocean: '#0062ff', ember: '#d1442f' };

export const ThemeLab = component({
  name: 'theme-lab',
  description: 'Rethemes the page by writing CSS custom properties from state.',
  state: schema({ brand: enums(['ocean', 'ember']).default('ocean') }),
  intents: {
    setBrand: intent({
      description: 'Change the accent colour.',
      input: schema({ brand: enums(['ocean', 'ember']) }),
      run: ({ state, input }) => (state.brand = input.brand),
    }),
  },
  view: ({ state, intents }) => (
    <section style={{ '--brand': BRANDS[state.brand] }}>
      <button class="cta" onClick={intents.setBrand.with({ brand: 'ember' })}>
        Primary action
      </button>
    </section>
  ),
});
```

Custom properties are valid keys in the typed `style` object, so `--brand` is checked like any other property. See [inline and JSX styles](/docs/styles/inline-and-jsx).

## Why this beats generating classes

Four accents × two densities × two radii is sixteen hand-written variant classes, and every new axis multiplies the last. As custom properties it stays three declarations that happen to hold different values — and the stylesheet never grows.

It also means **no new CSS is loaded when the theme changes**. The document's stylesheet count is identical before and after; only computed values differ. That is the difference between retheming and re-downloading.

## Server-rendered from the first byte

The properties are written into the markup during SSR, so the themed page arrives already themed:

```html
<section style="--brand:#0062ff">…</section>
```

There is no flash of default styling waiting for JavaScript, because the island's state was already resolved on the server. See [SSR and resumability](/docs/guide/ssr-and-resumability).

## Persisting the choice

A theme that resets on reload is not a theme. The picked value is ordinary island state, so it persists the same way any other state does — with a [`store()` and `persist: 'local'`](/docs/guide/stores), or by lifting it into [typed URL state](/docs/reference/client-state) when the theme should survive being shared as a link.

Custom properties also compose with the OS preference rather than competing with it — see [dark mode](/docs/styles/dark-mode) for how the two fit together.
