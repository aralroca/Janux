# Sass

Sass needs no configuration in Janux beyond the file extension. Rename the stylesheet entry and it is compiled.

Runnable version of this page: [`examples/with-sass`](https://github.com/aralroca/Janux/tree/main/examples/with-sass).

## Setup

```bash
bun add -d sass
```

```
src/
  styles.scss          ← the entry, found by name
  styles/
    _tokens.scss       ← partials, pulled in with @use
```

That is the whole setup. There is no `vite.config` to create and no PostCSS pipeline to declare — Janux resolves the first of `styles.css`, `styles.scss`, `styles.sass` and `styles.less` that exists, and hands it to the bundler as an entry.

`.sass` (the indented syntax) and `.less` are resolved the same way; install `less` instead of `sass` for the latter.

## Always one sheet

Whatever the extension, the build emits **`dist/client/styles.css`** and the shell links that:

```html
<link rel="stylesheet" id="jx-style-0" href="/styles.css">
```

Nothing downstream needs to know a preprocessor was involved. Deployment adapters, `inlineStyles` and the 0 KB-JS static pages all behave identically.

## What it buys you

Everything resolves at build time, so the browser receives plain CSS and no Sass runtime. The case that earns the dependency is generating rules you would otherwise repeat:

```scss
// src/styles/_tokens.scss
$accents: (
  'ocean': #0062ff,
  'moss': #12805c,
  'ember': #d1442f,
  'plum': #7b3fbf,
);

@mixin card-surface($border) {
  padding: 1.25rem;
  border: 1px solid $border;
  border-radius: 0.9rem;
}
```

```scss
// src/styles.scss
@use './styles/tokens' as *;

.card {
  @include card-surface(var(--line));

  h2 { margin: 0; }
}

@each $name, $color in $accents {
  .accent-#{$name} {
    border-color: $color;
    h2 { color: $color; }
  }
}
```

Four variant classes from one loop. The compiled output contains no trace of the loop, the map or the mixin:

```css
.card{padding:1.25rem;border:1px solid var(--line);border-radius:.9rem}
.card h2{margin:0}
.accent-ocean{border-color:#0062ff}
.accent-ocean h2{color:#0062ff}
.accent-moss{border-color:#12805c}
/* … */
```

## Driving generated classes from state

Generated class names are just class names, so an island picks between them the usual way:

```tsx
<article class={`card accent-${state.accent}`}>…</article>
```

## Sass and custom properties together

They solve different halves of the problem, and the examples use both:

- **Sass variables** (`$accents`) are gone by the time the browser sees the file. Use them for anything decided at build time — scales, generated variants, computed values.
- **[Custom properties](/docs/styles/css-variables)** (`var(--brand)`) survive into the browser. Use them for anything that has to change while the page is live.

A useful rule of thumb: if a designer picks it, Sass can hold it; if a *user* picks it, it has to be a custom property.
