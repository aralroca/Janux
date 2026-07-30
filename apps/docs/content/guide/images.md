# Images

An image is the heaviest thing most pages ship and the easiest one to get wrong: the wrong format, one size for every screen, and no reserved box, so the layout jumps when the bytes land. `<Image>` is the framework's answer to all three, and it costs nothing at runtime — an image has nothing to hydrate, so it doesn't.

```tsx
import { Image } from 'janux';

export default function HomePage() {
  return (
    <Image
      src="/photos/hero.jpg"
      alt="The view from the pass"
      width={1200}
      height={675}
      priority
    />
  );
}
```

That renders:

```html
<picture>
  <source
    type="image/avif"
    srcSet="/_janux/image/photos/hero.jpg/320.avif 320w, …"
    sizes="1200px">
  <source
    type="image/webp"
    srcSet="/_janux/image/photos/hero.jpg/320.webp 320w, …"
    sizes="1200px">
  <img
    src="/photos/hero.jpg"
    alt="The view from the pass"
    width="1200"
    height="675"
    loading="eager"
    decoding="async"
    fetchPriority="high">
</picture>
```

No script, no island, no measurement. The browser picks a candidate from the `srcset` before it has run a line of JavaScript — which is the only way to be fast at this.

## Props

| Prop | Type | Notes |
|---|---|---|
| `src` | `string` (required) | A path into `public/`, like `/photos/hero.jpg`. Any URL with `unoptimized` |
| `alt` | `string` (required) | `alt=""` is the right value for a decorative image. A missing one is not an option |
| `width` | `number` (required) | The **layout** width in CSS pixels. The `srcset` candidates are chosen around it |
| `height` | `number` | Required unless you give `aspectRatio` |
| `aspectRatio` | `number \| '16/9'` | The other way to state the box: the height is derived from `width` |
| `sizes` | `string` | Layout widths that pick from the `srcset`. Defaults to `<width>px` |
| `priority` | `boolean` | `loading="eager"` + `fetchpriority="high"`. For the LCP image, and nothing else |
| `unoptimized` | `boolean` | Link the source as-is. Required for a remote URL |
| `class`, `style` | | Passed through — layout is the app's business |

That is the whole surface. There is no `quality`, no `placeholder`, no `loader`, no `fill`: the defaults are the answer for the cases those options exist to rescue, and CSS is better at the rest.

## The box is not optional

`width` plus either `height` or `aspectRatio` is required, and that is the feature. Both end up as real `width`/`height` attributes, which is what lets the browser reserve the space before a single byte of the image arrives:

```tsx
import { Image } from 'janux';

export function Hero() {
  // 1200 / (16/9) → height="675", written onto the tag
  return (
    <Image src="/photos/hero.jpg" alt="Aurora" width={1200} aspectRatio="16/9" />
  );
}
```

For a **fluid** image — one that spans a column rather than sitting at exactly 1200px — add the one CSS rule that makes the attributes describe a ratio instead of a fixed size:

```css
img {
  max-width: 100%;
  height: auto;
}
```

Without `height: auto` the attributes fight your layout and the picture distorts. With it, the browser derives the aspect ratio from the attributes, reserves the right box at any width, and Cumulative Layout Shift stays at 0.

## Candidates, and the `sizes` that pick between them

The `srcset` is derived from the layout `width`: every ladder width (320, 640, 960, 1280, 1920) up to **twice** it, because 2× is the last one a high-density screen can use and anything beyond is bytes no device asks for.

`sizes` defaults to `<width>px`, which is correct for a fixed-size image. For a fluid one, say how wide it actually renders:

```tsx
import { Image } from 'janux';

export function Banner() {
  return (
    <Image
      src="/photos/hero.jpg"
      alt="Aurora"
      width={1200}
      aspectRatio="16/9"
      sizes="(max-width: 70rem) 100vw, 70rem"
    />
  );
}
```

Getting `sizes` wrong is the classic way to ship a responsive image that still downloads the largest file, so it is worth one line of thought per image.

## `priority`, and why only once

Everything is `loading="lazy"` by default: an image below the fold is not worth a connection. The one image that *is* — the largest thing above the fold, usually your LCP element — gets `priority`, which makes it eager and high priority.

Marking several images `priority` is the same as marking none: the point is to tell the browser which single fetch matters most.

## What the build actually writes

The variant URL is a pure function of the source path, a width and a format, so nothing has to be registered anywhere:

- **`janux dev`** encodes on demand, so the page you are writing picks from the same candidates as the page you ship.
- **`janux build`** walks `public/`, encodes every ladder width in AVIF and WebP, and writes them under `dist/client/_janux/image/`. `janux start` then serves files rather than making them.
- **[`output: 'static'`](/docs/recipes/deploying)** works for exactly the same reason: the files are already there, so a static host with no server at all serves a fully optimized page.

```
dist/client/
  photos/hero.jpg                             ← the original, still the <img> fallback
  _janux/image/photos/hero.jpg/320.avif       ← one file per width × format
  _janux/image/photos/hero.jpg/320.webp
  …
```

A width larger than the source is never upscaled — the file exists so no candidate 404s, it just stops at the pixels the original has.

## Sources it does not touch

Two cases are passed straight through as a plain `<img>`, box and lazy-loading intact:

- **SVG and GIF.** Vector is already optimal, and a GIF is usually animated; rasterizing either would be a downgrade.
- **Anything remote**, but only when you say so:

```tsx
import { Image } from 'janux';

export function Avatar() {
  return (
    <Image
      src="https://cdn.example.com/a.jpg"
      alt="Ana"
      width={64}
      height={64}
      unoptimized
    />
  );
}
```

Without `unoptimized`, a remote `src` **throws**. There is no local file to encode, so the alternative would be a `<picture>` whose every candidate 404s — a failure you would find in production instead of at the first render.

## See also

- [`examples/with-images`](https://github.com/aralroca/Janux/tree/main/examples/with-images) — the hero, the lazy gallery and both pass-through cases, exported with `output: 'static'`
- [Core API](/docs/reference/core-api) — `Image` and the URL helpers the optimizer shares with it
