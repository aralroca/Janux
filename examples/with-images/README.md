# with-images — `<Image>`, the optimizer, and `output: "static"`

The image performance you would otherwise rebuild in every app, inherited from the framework:

- **`<Image>` from `janux`** — one declarative tag. It renders a `<picture>` with AVIF and WebP candidates and keeps the original as the fallback every browser can take.
- **Variants written at build time** — `janux build` encodes every ladder width (320/640/960/1280/1920) in both formats into `dist/client/_janux/image/`, so a static host serves files and nothing optimizes at request time. `janux dev` answers the same URLs on demand, so what you write is what you ship.
- **`srcset`/`sizes` derived** — the candidates come from the layout `width` (up to 2×, for a 2× screen); `sizes` defaults to `<width>px` and is overridden for a fluid image, like the hero here.
- **CLS 0 by construction** — `width` plus either `height` or `aspectRatio` is required, so every `<img>` carries the real box and nothing on the page moves while it loads.
- **`priority` for the LCP image** — `loading="eager"` + `fetchpriority="high"` on the hero; everything else is `loading="lazy"`.
- **Explicit opt-out, never a silent one** — a remote `src` needs `unoptimized` or `<Image>` throws. An SVG is passed through untouched, because rasterizing vector would be a downgrade.
- **Zero JavaScript** — no `src/client.ts`. An image has nothing to hydrate, so this page ships no runtime at all.

```bash
bun install
bun run dev     # http://localhost:4321
bun run build   # dist/client is fully static, variants included
```

## Where things live

| Path | What it is |
|---|---|
| `public/photos/*.jpg` | The sources. Only these are read; the variants are derived from them |
| `src/routes/index.tsx` | The hero (`priority`, fluid `sizes`, `aspectRatio`), the lazy gallery, and the two sources the optimizer leaves alone |
| `src/routes/_layout.tsx` | The shell — plain HTML, no client entry |
| `src/styles.css` | `img { max-width: 100%; height: auto }` — the rule that lets `width`/`height` reserve a fluid box |
| `janux.config.ts` | `output: 'static'` — the archetype with no server to optimize anything at runtime |

## What the build leaves behind

```
dist/client/
  index.html                                  ← references the variants below
  photos/aurora.jpg                           ← the original, still the <img> fallback
  _janux/image/photos/aurora.jpg/320.avif     ← one file per width × format
  _janux/image/photos/aurora.jpg/320.webp
  …
```

The URL of a variant is a pure function of the source path, a width and a format, which is why the component can link one without asking the build what exists — and why the build can write exactly what pages reference without watching them render.
