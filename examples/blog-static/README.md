# blog-static — a markdown blog with `output: "static"`

A blog whose posts are markdown files, prerendered to plain HTML at build time:

- **`output: "static"`** — `janux build` prerenders every page into `dist/client`; deploy it to any static host, no server.
- **`staticParams` on `/posts/[slug]`** — enumerates the posts so the dynamic route becomes concrete prerendered pages (and concrete `llms.txt` entries).
- **Zero JavaScript** — no `src/client.ts`, so pages ship without a single script; navigation is plain document loads.
- **Speculation rules** — configured in `janux.config.ts` (`eagerness: 'moderate'`, excluding `/llms.txt` and `/sitemap.xml`), so hovering an index link prefetches the post the browser way.
- **Agent face** — `/llms.txt`, `/sitemap.xml` and the markdown projection of every page (`/posts/<slug>.md`; `/` → `/.md`) work on the server **and** on a static host: the build writes one `.md` file beside each prerendered page. The layout footer links them, because they are half of what this example is.
- **Design without a runtime** — a reading column, post cards and light/dark theming, all in one stylesheet: `color-scheme: light dark` + `light-dark()` follow the OS with no theme script.

```bash
bun install
bun run dev   # http://localhost:4321
bun run build   # dist/client is fully static
```

## Where things live

| Path | What it is |
|---|---|
| `content/*.md` | The posts — front matter (`title`, `date`, `description`) + markdown body |
| `src/content.ts` | Reads and parses `content/` (the `staticParams` source, newest first) + byline helpers |
| `src/styles.css` | The whole design: tokens, reading column, cards, dark mode |
| `src/routes/_layout.tsx` | Masthead and the machine-readable footer |
| `src/markdown.ts` | Tiny dependency-free markdown → HTML renderer |
| `src/routes/index.tsx` | The post index |
| `src/routes/posts/[slug].tsx` | One post — `staticParams` + per-post `meta` |
| `janux.config.ts` | `output: 'static'`, `siteUrl`, `llmsTxt`, speculation rules |
