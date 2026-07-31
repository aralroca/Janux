---
title: Global styles
description: "The baseline, and the one every other approach sits on top of: a plain CSS file at src/styles.css."
---

# Global styles

The baseline, and the one every other approach sits on top of: a plain CSS file at `src/styles.css`.

```css
/* src/styles.css */
:root {
  --brand: #0062ff;
  --line: #e2e8f0;
}

body {
  margin: 0;
  font: 16px/1.6 ui-sans-serif, system-ui, sans-serif;
}

.card {
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: 1rem;
}
```

There is nothing to import and nothing to register. The file is found by name, bundled by Vite, and linked once in the server-rendered shell:

```html
<link rel="stylesheet" id="jx-style-0" href="/styles.css">
```

## It is a bundler entry, not a copied file

The stylesheet always goes through the bundler, even when it contains no preprocessor syntax at all. That is what makes these work:

```css
@import "@janux/tailwind";        /* a bare specifier from node_modules */
@import "./theme/typography.css"; /* a relative partial */

.hero {
  background: url('./assets/hero.avif'); /* rewritten and hashed */
}
```

Copying the file verbatim would ship all three as literal text the browser cannot resolve. Because it is an entry, `@import` of a dependency's CSS, bare specifiers and `url()` assets resolve exactly as they did in dev.

## Assets that are not CSS

Anything in `public/` is copied to the output as-is and served from the root — fonts, images, favicons:

```
public/
  favicon.svg     → /favicon.svg
  fonts/inter.woff2 → /fonts/inter.woff2
```

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter.woff2') format('woff2');
  font-display: swap;
}
```

Use `public/` for files whose URL you want to control. Use a relative `url()` from the stylesheet for everything the bundler should hash and fingerprint.

## Inlining the sheet

For a small stylesheet, the `<link>` is an extra round trip before first paint. `inlineStyles` embeds the built CSS in the document instead:

```ts
// janux.config.ts
export default { inlineStyles: true };
```

This is a **production-only** switch: `janux dev` keeps the `<link>` so CSS hot reload keeps working. It reads back the sheet the build just emitted, so before the first `janux build` the shell simply falls back to the link.

Inlining is a win while the CSS is small enough to be cheaper than a request, and a loss once it is big enough to be worth caching separately across pages.

## No stylesheet at all

The entry is optional. An app with no `src/styles.css` gets no `<link>` and no CSS asset — which, combined with a page that has no islands, is how a Janux page ships [0 KB of both CSS and JS](/docs/guide/ssr-and-resumability).
