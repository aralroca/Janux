# Examples

Every example in [`examples/`](https://github.com/aralroca/Janux/tree/main/examples) is a complete, runnable app. Scaffold any of them as your own project straight from the CLI:

```bash
bun create janux my-shop --example shop
cd my-shop && bun install && bun run dev   # http://localhost:4321
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
| [`with-suspense`](https://github.com/aralroca/Janux/tree/main/examples/with-suspense) | Streaming SSR: two slow `source`s behind independent [`suspense`](/docs/guide/ssr-and-resumability) views that reveal mid-stream, and a `/broken` route where `error` views catch and bubble. |
| [`with-tailwind`](https://github.com/aralroca/Janux/tree/main/examples/with-tailwind) | [`@janux/tailwind`](/docs/recipes/tailwind) zero-config: a pricing page with dark mode and a billing toggle island, styled only with Tailwind v4 utilities — the whole setup is one dependency and a one-line CSS import. |
| [`with-forms`](https://github.com/aralroca/Janux/tree/main/examples/with-forms) | One [`schema()`](/docs/guide/schema) as the contract for three surfaces: the form UI with per-field errors and no reload, the persisting `api()` endpoint, and the typed tool an agent calls with the same data a human submits. |
| [`with-optimistic-ui`](https://github.com/aralroca/Janux/tree/main/examples/with-optimistic-ui) | [`mutation()`](/docs/reference/data-cache-api) with optimistic writes and real rollback: `onMutate` shows the favorite instantly, the server rejects every third save, and `onError` restores the snapshot with a visible notice. |
| [`cross-island-state`](https://github.com/aralroca/Janux/tree/main/examples/cross-island-state) | A [`store()`](/docs/guide/stores) cart shared by five islands with no prop drilling: the grid writes, badge and panel read, a toast reacts to the bus event, `persist: 'local'` survives reloads, and a bundle enters in one `batch()`. |
| [`with-advanced-routing`](https://github.com/aralroca/Janux/tree/main/examples/with-advanced-routing) | The full [router grammar](/docs/guide/navigation): `[slug]`, `[...path]`, `[[...rest]]`, `[id=integer]`/`[uid=uuid]` matchers, nested `_layout.tsx` chains, `(marketing)` groups — plus SPA navigation with a `persist` island in the shell. |

Each folder has a README with the details. The [Playground](/playground) runs smaller, self-contained snippets directly in the browser.

> **Tip**: the tutorial builds the `create-janux` starter app — `bun create janux my-app` — step by step, starting at [Tasks app, part 1](/docs/tutorial/tasks-app-part-1).
