# Store auto-wake

Shared state without `eager`: the first client-side write to a store resumes every inert island that declares it in `use`, so no reader ever shows stale SSR HTML — and no reader has to opt out of resumability to guarantee it.

- **Everything is lazy.** The page boots with zero component code running. The scoreboard SSRs its "Kickoff pending…" branch and stays inert.
- **The write is the wake signal.** Clicking a goal resumes the bench (normal interaction resume), its intent writes the `score` store, and the runtime resumes every island whose host carries that store in `data-jx-use` — the attribute SSR stamps from the component's `use: { score }`.
- **Flipped conditionals just get patched.** The woken scoreboard re-runs its view against live store state and reconciles it with the DOM: the "kickoff" branch flips to the score in place, no adoption to break, no full re-render.
- **Selective by design.** The footer has no `use`, so store writes never touch it: it stays inert HTML forever.
- **Navigations stay safe.** A written store is marked dirty; after an SPA navigation (or a suspense chunk arriving late), incoming inert readers of a dirty store resume on arrival instead of showing markup a server without those writes rendered.

```bash
bun install
bun run dev   # http://localhost:4333
```

Verify it yourself: open devtools, load the page (no island mounts), click one goal and watch the scoreboard flip — then check `document.querySelector('janux-island[data-jx="scoreboard#default"]')` was never interacted with.

## Where things live

| File | What it is |
| --- | --- |
| `src/stores.ts` | The `score` store — one `goal` intent, a `total` derived. |
| `src/components/Bench.tsx` | The mutator. Lazy; resumes on click and writes the store. |
| `src/components/Scoreboard.tsx` | The reader. Lazy, conditional view, woken by the first write. |
| `src/components/Footer.tsx` | No `use`: proof the wake is selective. |
| `src/client.ts` | `boot({ defs })` — nothing else; the wake is framework behavior. |
