# Tailwind v4, zero config

A pricing page styled 100% with Tailwind utilities — no `tailwind.config`, no `vite.config`, no PostCSS setup:

- **One-line install** — `bun add @janux/tailwind` is the whole configuration: the CLI detects the package and wires the official Tailwind v4 pipeline into `janux dev` and `janux build`.
- **One-line stylesheet** — `src/styles.css` is just `@import "@janux/tailwind";` and every utility works, in routes and islands alike.
- **Compiled, not a CDN** — `janux build` content-scans the app and emits only the utilities in use to `dist/client/styles.css`; static pages keep shipping 0 KB of JS.
- **Dark mode for free** — `dark:` variants follow the OS `prefers-color-scheme`, no toggle code required.
- **Utilities re-render with state** — the `pricing-table` island recalculates the three tiers when you switch monthly/annual billing; active/featured looks are plain conditional utility strings.

```bash
bun install
bun run dev   # http://localhost:4321
```

```css
/* src/styles.css — the entire Tailwind setup */
@import "@janux/tailwind";
```

## Where things live

| Path                         | What                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| `src/styles.css`             | The one-line Tailwind import                                      |
| `src/routes/index.tsx`       | The pricing page: static markup, utilities only                   |
| `src/components/Pricing.tsx` | Tier data + the `pricing-table` island (monthly/annual toggle)    |
| `src/client.ts`              | Boots the island in the browser                                   |
