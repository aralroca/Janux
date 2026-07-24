# i18n — locale routing & typed translations

Internationalized site in three locales (`en`, `es`, `fr`):

- **Locale-prefixed routing** — `/en`, `/es/about`, … with detection and a `JANUX_LOCALE` cookie for the preferred locale.
- **Type-safe `t()`** — message catalogs in `src/i18n/messages/*.ts`; keys and interpolations are checked by the compiler, plurals included.
- **Language switcher** in the `Header` component swaps locales preserving the current page.
- **Page-scoped client translations** — islands like `Counter` only ship the messages they use.
- **Static export friendly** — `janux build` emits one tree per locale (`dist/client/{en,es,fr}/…`).

```bash
bun install
bun run dev   # http://localhost:3000
```
