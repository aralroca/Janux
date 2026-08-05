# with-offline

A prerendered guide that keeps working when the network does not — and updates cleanly on the next deploy.

The whole service worker is three lines:

```ts
// src/sw.ts
import { offlineFirst } from 'janux/service-worker';

offlineFirst({ fallback: '/offline' });
```

The file existing is the opt-in. `janux build` sees it, bundles it to `dist/client/sw.js` with the manifest of the assets it just emitted, and every page registers it. Delete the file and the app has no worker again, with nothing else to undo.

## Run it

A service worker is a production artifact — `janux dev` neither builds nor registers one, because a worker installed while a page is being written outlives the edit that installed it.

```sh
bun run build
bun run start   # http://localhost:4340
```

## What to try

1. Open the home page, then **Signals**, so both are cached.
2. Switch the network off: devtools → Network → Offline, or airplane mode.
3. **Reload.** Both pages still render, and the checklist still ticks — the client bundle came from the cache too.
4. Visit a URL you never opened, e.g. `/glacier`. You get the app's own offline notice, not the browser's error page.
5. Change something, run `bun run build` again, and reload with the network back on. The page moves to the new build and the previous version's cache is deleted — without closing the tab.

## What is being shown

| Piece | Where |
|---|---|
| The worker | `src/sw.ts` — one call, and the exit if you want your own |
| The offline fallback | `src/routes/offline.tsx`, named in `sw.ts` and precached on install |
| An island that works offline | `src/components/Checklist.tsx` |
| Installability | `public/manifest.webmanifest` — present in `public/`, so the shell links it |

Pages are answered **network-first**: online you always see the current deploy, and the cached copy is the fallback rather than the preference. Hashed build output is answered **cache-first**, because a content-hashed name cannot change behind your back.

The full explanation is in [the service workers guide](https://janux.build/docs/guide/service-workers).
