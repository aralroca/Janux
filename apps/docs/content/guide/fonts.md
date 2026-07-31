---
title: Fonts
description: Self-hosted, subset and preloaded, with a fallback face measured from the real font so the swap moves nothing.
---

# Fonts

A webfont shifts the layout twice: once when the fallback paints, once when the real file swaps in. The second one is the shift Lighthouse counts, and it is why so many sites either hide their text for three seconds or give up and ship the system stack. Neither is necessary. Declare the font and Janux does the rest — at build time, with nothing left to run in the browser.

```ts
import { defineConfig } from 'janux';

export default defineConfig({
  fonts: [
    {
      family: 'Inter',
      weights: [400, 600, 700],
      subsets: ['latin'],
      variable: '--font-sans',
    },
  ],
});
```

```css
body {
  font-family: var(--font-sans);
}
```

That is the whole adoption. What it buys:

- **Self-hosted.** The `woff2` is downloaded once and served from your own origin — no request to `fonts.gstatic.com`, no third party in the critical path.
- **Subset.** Only the unicode ranges you asked for are shipped. A latin page never downloads Cyrillic.
- **Preloaded.** The one file the first paint needs gets a `<link rel="preload" as="font" crossorigin>` at the very top of the head, ahead of the stylesheet.
- **Non-shifting.** A `@font-face` fallback is generated with `size-adjust`, `ascent-override` and `descent-override` computed from the real font's metrics, so the text occupies its final space before the webfont arrives.
- **Zero JavaScript.** All of it is a `<link>` and a `<style>`. Nothing measures anything at runtime.

## Options

| Option | Type | Notes |
|---|---|---|
| `family` | `string` (required) | Google Fonts family name, e.g. `Inter` |
| `weights` | `number[]` | Default `[400]`. Most families are one variable file, so extra weights are usually free |
| `styles` | `('normal' \| 'italic')[]` | Default `['normal']` |
| `subsets` | `string[]` | Default `['latin']`. Everything else is never downloaded |
| `display` | `'swap' \| 'optional' \| …` | Default `swap` — which the adjusted fallback is what makes safe |
| `preload` | `boolean` | Default true. Preloads the primary subset's lightest upright weight |
| `fallback` | `'sans-serif' \| 'serif' \| 'monospace'` | Default `sans-serif`. The generic the overrides are measured against |
| `variable` | `string` | A custom property carrying the whole stack, e.g. `--font-sans` |

## Why the fallback face is the whole trick

`font-display: swap` paints text immediately in a fallback font and replaces it when the webfont lands. That is good for reading and bad for layout — unless the fallback occupies exactly the same space. Which is what these three descriptors are for:

```css
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107.12%;
  ascent-override: 90.44%;
  descent-override: 22.52%;
  line-gap-override: 0%;
}
```

- **`size-adjust`** scales Arial until its average glyph is as wide as Inter's — `(978/2048) ÷ (913/2048)` for this pair, straight from both fonts' own metrics.
- **`ascent-override` / `descent-override`** restate the vertical metrics against that *already scaled* em, so the line box does not move either. Stating them against the raw `unitsPerEm` would apply the scale twice.

Those numbers are not a table Janux ships. They are read out of the `woff2` the build just downloaded, which is why they cannot go stale when a family is updated. `variable: '--font-sans'` then names the stack once:

```css
:root {
  --font-sans: 'Inter', 'Inter Fallback', sans-serif;
}
```

Read more about the descriptor on [MDN](https://developer.mozilla.org/docs/Web/CSS/@font-face/size-adjust).

## Where the files come from, and when

The network is touched **once per font, ever**. Everything — the Google stylesheet, the `woff2` files, the extracted metrics — is cached under `node_modules/.janux/fonts`:

- **`janux dev`** resolves on first start and serves the files from that cache. Later starts are offline.
- **`janux build`** copies them into `dist/client/_janux/font/` and writes the finished CSS and preload list beside them.
- **`janux start` and [`output: 'static'`](/docs/recipes/deploying)** read those artifacts. Neither resolves anything: a production server never calls Google, and a static host has no server to do it with.

A cold cache with no network is a build error naming the family, not a page that quietly ships without its font. In CI that means the first build of a job downloads the font, exactly as it downloads dependencies.

## What is not here

There is no `localFont`, no glyph-level subsetter and no variable-axis configuration. Google publishes one pre-subset `woff2` per unicode range already, so the subsetting is a filter rather than a rewrite — and the 5% those features serve is not worth the surface on every other app.

## See also

- [Images](/docs/guide/images) — the other half of Cumulative Layout Shift
- [`examples/with-images`](https://github.com/aralroca/Janux/tree/main/examples/with-images) — both halves, exported with `output: 'static'`
