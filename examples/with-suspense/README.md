# Streaming suspense + error boundaries

Two routes that make Janux's streaming SSR visible:

- **`/dashboard`** — two islands with deliberately slow sources (`slow-stats` ~1.5s,
  `slow-news` ~2.5s). Each declares a `suspense` view in `component()`: the skeleton
  streams in place, the page never blocks, and the real content swaps in when its
  source resolves — independently per island, on first load and on SPA navigations
  (the streaming diff and the swap coexist).
- **`/broken`** — islands that throw during SSR. `failing-card` renders its own
  `error` view; `broken-leaf` has none, so the throw bubbles to `bubble-shell`'s
  error view. The rest of the page stays alive either way.

```sh
bun install
bun run dev
```
