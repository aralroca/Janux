# blog-static — a markdown blog with `output: "static"`

A blog whose posts are markdown files, prerendered to plain HTML at build time:

- **`output: "static"`** — `janux build` prerenders every page into `dist/client`; deploy it to any static host, no server.
- **`staticParams` on `/posts/[slug]`** — enumerates the posts so the dynamic route becomes concrete prerendered pages (and concrete `llms.txt` entries).
- **Zero JavaScript** — no `src/client.ts`, so pages ship without a single script; navigation is plain document loads.
- **Speculation rules** — configured in `janux.config.ts` (`eagerness: 'moderate'`, excluding `/llms.txt` and `/sitemap.xml`), so hovering an index link prefetches the post the browser way.
- **Agent face** — the server (and the static build) expose `/llms.txt` and `/sitemap.xml`; a running server also projects any page as markdown at `/posts/<slug>.md` (server-only: the static export does not emit `.md` files).

```bash
bun install
bun run dev   # http://localhost:4321
bun run build   # dist/client is fully static
```

## Where things live

| Path | What it is |
|---|---|
| `content/*.md` | The posts — front matter (`title`, `date`, `description`) + markdown body |
| `src/content.ts` | Reads and parses `content/` (the `staticParams` source, newest first) |
| `src/markdown.ts` | Tiny dependency-free markdown → HTML renderer |
| `src/routes/index.tsx` | The post index |
| `src/routes/posts/[slug].tsx` | One post — `staticParams` + per-post `meta` |
| `janux.config.ts` | `output: 'static'`, `siteUrl`, `llmsTxt`, speculation rules |
