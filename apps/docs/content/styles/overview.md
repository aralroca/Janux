# Styling a Janux app

Janux has no opinion about how you write CSS, and no `vite.config` for you to edit. It also ships no components to style — [where your buttons come from](/docs/guide/design-system) is answered on its own page. What it does have is a single, predictable contract: **one stylesheet entry, one `<link>` in the HTML shell**. Everything below is a different way of filling that entry.

| Approach | Resolved | Use it when |
|---|---|---|
| [Global styles](/docs/styles/global-styles) | build | The baseline: plain CSS in `src/styles.css`. Everything else builds on it. |
| [Inline and JSX styles](/docs/styles/inline-and-jsx) | render | A value only the component knows — a computed width, a colour from data. |
| [CSS variables](/docs/styles/css-variables) | runtime | Theming that changes while the page is live, without shipping new rules. |
| [Dark mode](/docs/styles/dark-mode) | runtime | Following (or overriding) the reader's OS preference. |
| [Sass](/docs/styles/sass) | build | Variables, nesting, mixins and loops that generate CSS for you. |
| [Tailwind](/docs/styles/tailwind) | build | Utility classes, with the whole setup being one dependency. |

## The one contract

Whatever you choose, the app's stylesheet is the file named `src/styles.<ext>`:

```
src/
  styles.css      ← or styles.scss, styles.sass, styles.less
```

`janux dev` serves it through Vite (with hot reload); `janux build` compiles it and emits **`dist/client/styles.css`** — the one sheet the server-rendered shell links, whatever extension you started from. There is nothing to register and nothing to import: the file's existence is the configuration.

```html
<link rel="stylesheet" id="jx-style-0" href="/styles.css">
```

## Choosing between them

These are not exclusive, and most real apps use two or three at once — the with-sass example uses a preprocessor for its tokens *and* custom properties for the parts that change at runtime.

A rough guide:

- **Reach for global CSS first.** A Janux page is server-rendered HTML with real class names; plain CSS goes further here than in a client-rendered framework.
- **Reach for a preprocessor** when you find yourself writing the same block with four different colours — that is what [`@each`](/docs/styles/sass) is for.
- **Reach for custom properties** when the value has to change *after* the build: a theme picker, a density toggle, a brand colour that arrives from an API.
- **Reach for inline styles** only for values the stylesheet genuinely cannot know.

## What is not supported yet

**CSS Modules** (`import styles from './X.module.css'`) do not work in production builds. Vite scopes the class names for the client bundle, but the server renderer imports the same file through Bun, which hands back a URL rather than a class map — so server-rendered markup gets an empty `class` attribute, and the emitted module CSS is never linked by the shell. Use [CSS variables](/docs/styles/css-variables) or a naming convention (BEM and friends) for component-scoped styling in the meantime.
