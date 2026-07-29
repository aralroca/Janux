# Optimistic UI — star favorites with rollback

A favorites list where starring lands instantly, and a deterministic server failure (every 3rd save rejects) exhibits the real rollback:

- **`mutation()` + `onMutate`** — the star is written into the `useQuery` cache before the server answers; the snapshot `onMutate` returns is the rollback point.
- **`onError` rollback** — the server rejects every 3rd save on purpose (in-memory counter in `favorites.api.ts`, plus artificial latency so the optimistic window is visible): the star vanishes and a notice explains why.
- **`onSettled` re-sync** — win or lose, `invalidateQueries(['favorites'])` refetches, so the UI always converges to server truth and survivors persist.
- **SSR caveat** — `useQuery` resolves nothing on the server: the first paint ships the pending shell (`Loading…`) and data materializes on hydration.
- **Agent parity** — `favorites.star { name: "Aurora" }` drives the exact same optimistic intent a click does, and the `api.favorites.*` tools are on the manifest too.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Where things live

| Path | What |
| --- | --- |
| `src/server/favorites.api.ts` | In-memory favorites, the every-3rd-call failure and the artificial latency |
| `src/components/Favorites.tsx` | The island: `useQuery` list + `mutation()` with optimistic write, rollback and `star`/`reset` intents |
| `src/routes/index.tsx` | The page shell |
| `src/client.ts` | Boots the island in the browser |
