# Runtime theming with CSS variables

Three knobs — accent, density, corner radius — retheme the whole page without a rebuild and without shipping a single extra CSS rule:

- **State writes custom properties** — the island renders `style={{ '--brand': …, '--pad': …, '--radius': … }}` on one wrapper, and the cascade repaints everything underneath it.
- **Typed, including custom properties** — Janux's `style` prop accepts a `CSSProperties` object where `--*` keys are allowed alongside the usual camelCased ones, so the theme object is type-checked.
- **No class explosion** — 4 accents × 2 densities × 2 radii would be 16 hand-written variants. Here it is three declarations that happen to hold different values.
- **The complement to Sass and Tailwind** — Sass resolves at build time and Tailwind ships utilities; custom properties are the option whose values can still change once the page is live.

```bash
bun install
bun run dev     # http://localhost:4321
```

```bash
bun run build   # then: bun run start
```

## The whole idea

```tsx
<section style={{ '--brand': BRANDS[state.brand], '--radius': CORNERS[state.corner] }}>
  {/* every rule below reads var(--brand) — none of them names a colour */}
</section>
```

See [Styles → CSS variables](https://janux.build/docs/styles/css-variables) for the full picture.
