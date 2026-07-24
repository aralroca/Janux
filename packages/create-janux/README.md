# create-janux

Scaffold a new [Janux](https://github.com/aralroca/Janux) app:

```bash
bun create janux my-app
cd my-app && bun install && bun run dev
```

The starter template ships a resumable counter island, an agent panel and an example unit test; the built-in copilot works once you set `JANUX_MODEL` or a provider API key.

Start from a complete [example app](https://github.com/aralroca/Janux/tree/main/examples) instead:

```bash
bun create janux my-shop --example shop
```

Available examples: `shop`, `i18n`, `interop-react`, `nested-islands`, `data-cache` (omit the name to list them).
