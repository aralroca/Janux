# Examples

Every example in [`examples/`](https://github.com/aralroca/Janux/tree/main/examples) is a complete, runnable app — clone the repo and start any of them:

```bash
git clone https://github.com/aralroca/Janux.git && cd Janux && bun install
bun run --cwd examples/shop dev   # http://localhost:3000
```

| Example | What it demonstrates |
|---|---|
| [`shop`](https://github.com/aralroca/Janux/tree/main/examples/shop) | The flagship app: catalog `source`, debounced persist `effect`, `confirm`-guarded checkout with human approval, copilot island, `orders/[id]` route and a headless agent eval (`bunx janux eval`). |
| [`i18n`](https://github.com/aralroca/Janux/tree/main/examples/i18n) | Locale-prefixed routing (`/en`, `/es`, `/fr`), type-safe `t()` with plurals, language switcher, page-scoped client translations, per-locale static export. |
| [`interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react) | A React component mounted **unchanged** with `foreign()`: tracked props, callbacks bridged to intents, hydrate directives. |
| [`nested-islands`](https://github.com/aralroca/Janux/tree/main/examples/nested-islands) | Stateful islands three levels deep with per-island render loops, conditional mount/dispose, each level agent-visible as a `ui://` resource. |
| [`data-cache`](https://github.com/aralroca/Janux/tree/main/examples/data-cache) | `useQuery` + `mutation` client cache, typed URL state (`?tag=…` deep links), agent parity: the agent's `catalog.filter` drives the same intent as a click. |

Each folder has a README with the details. The [Playground](/playground) runs smaller, self-contained snippets directly in the browser.

> **Tip**: the tutorial builds the `create-janux` starter app — `bun create janux my-app` — step by step, starting at [Tasks app, part 1](/docs/tutorial/tasks-app-part-1).
