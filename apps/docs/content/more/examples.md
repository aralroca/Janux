# Examples

Every example in [`examples/`](https://github.com/aralroca/Janux/tree/main/examples) is a complete, runnable app. Scaffold any of them as your own project straight from the CLI:

```bash
bun create janux my-shop --example shop
cd my-shop && bun install && bun run dev   # http://localhost:3000
```

Or run them in place inside the monorepo: `git clone https://github.com/aralroca/Janux.git && cd Janux && bun install && bun run --cwd examples/shop dev`.

| Example | What it demonstrates |
|---|---|
| [`shop`](https://github.com/aralroca/Janux/tree/main/examples/shop) | The flagship app: catalog `source`, debounced persist `effect`, `confirm`-guarded checkout with human approval, copilot island, `orders/[id]` route and a headless agent eval (`bunx janux eval`). |
| [`i18n`](https://github.com/aralroca/Janux/tree/main/examples/i18n) | Locale-prefixed routing (`/en`, `/es`, `/fr`), type-safe `t()` with plurals (`label_one` / `label_other`), language switcher, and page-scoped client translations — only the counter's keys ship to the browser. |
| [`interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react) | A React mixer mounted **unchanged** with `foreign()`: tracked props from island state and its `onBand` callback bridged to a `setBand` intent — the wrap-once pattern that gives a foreign component an agent surface. |
| [`nested-islands`](https://github.com/aralroca/Janux/tree/main/examples/nested-islands) | Stateful islands three levels deep with per-island render loops, conditional mount/dispose, each level agent-visible as a `ui://` resource. |
| [`with-web-agent`](https://github.com/aralroca/Janux/tree/main/examples/with-web-agent) | The console from the [home page](/) video, operated in natural language: [`createCopilot({ visualize })`](/docs/recipes/local-model-copilot) for the status chips, the animated ring and the backdrop veil; [`glowTarget`](/docs/reference/core-api) so the ring waits for React Flow nodes that mount a tick later; a `forbidden` intent that leaves the display name reachable only through the DOM fallback; and `@xyflow/react` mounted unchanged with `foreign()`. Runs offline — the planner is scripted, no API key. |
| [`data-cache`](https://github.com/aralroca/Janux/tree/main/examples/data-cache) | `useQuery` with a reactive key (the filter is part of `queryKey`) and typed [`urlState`](/docs/reference/client-state): `?tag=…` is deep-linkable, the Back button undoes a filter, and the agent's `catalog.filter` drives the same intent as a click. |

Each folder has a README with the details. The [Playground](/playground) runs smaller, self-contained snippets directly in the browser.

> **Tip**: the tutorial builds the `create-janux` starter app — `bun create janux my-app` — step by step, starting at [Tasks app, part 1](/docs/tutorial/tasks-app-part-1).
