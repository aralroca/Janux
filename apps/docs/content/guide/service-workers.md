---
title: Service workers, offline and PWA
description: One file turns an app offline-capable, with a caching strategy that does not strand visitors on the deploy they first met.
---

# Service workers, offline and PWA

A service worker sits between your pages and the network. It is the only way to make a web app open with no connection — and the fastest way to serve everyone a version of your site you shipped three months ago, if the caching is wrong.

Janux ships one file's worth of convention and a default strategy chosen around that second risk.

## The convention

Write `src/sw.ts`. That is the opt-in, and there is no flag anywhere that does it instead:

```ts
// src/sw.ts
import { offlineFirst } from 'janux/service-worker';

offlineFirst({ fallback: '/offline' });
```

`janux build` bundles it to `dist/client/sw.js` — one classic script, no imports — and every page the app serves registers it. With no `src/sw.ts` nothing is built, nothing is registered, and the HTML is byte for byte what it was before.

The reason it is a file and not a config flag: a worker somebody switches on without reading what it caches is not a bug you can ship a fix for. It is already running on their machine.

### It is a production artifact

`janux dev` neither builds nor registers a worker. A worker installed while a page is being written outlives the edit that installed it, and the next `bun run dev` gets served by a cache from the last one. Build the app and `janux start` it to exercise the worker.

Declining to register one is not the same as not having one, though. A worker is scoped to an **origin**, not to a process, so `janux dev --port 4340` inherits whatever `janux start --port 4340` installed an hour ago — the page comes up served by a build that no longer exists, `/styles.css` is answered from a cache Vite knows nothing about, and you get an unstyled page with no visible cause.

So dev reclaims the origin: if a worker is controlling the page it is unregistered, the page reloads once, and the leftover `janux-` caches are swept on the load after that. It says so in the console, and it does nothing at all when there is no worker — which is nearly every session.

## What the build hands the worker

The one thing a worker cannot work out for itself is what the files are called. The names are decided by the bundler, minutes earlier, on another machine — so the build reads its own output back and substitutes the answer in:

```ts
import { assets, version } from 'janux/service-worker';

// assets: ['/assets/app-a1b2c3d4.js', '/client.js', '/favicon.svg', '/styles.css']
// version: '63fd350b1adb0d90'
```

`version` is a hash of those files' names **and** bytes, so it changes when — and only when — the output does.

## The default strategy

`offlineFirst()` installs two rules that deliberately point in opposite directions.

**Hashed build output is answered from the cache.** The name carries a content hash, so the bytes behind it can never change; asking the network about them is a round trip whose only possible answer is the one already held. This is what makes a repeat visit work with no network at all.

**Everything else goes to the network first**, and falls back to the cache when there is none. A document answered cache-first is the classic way to strand a visitor on the deploy they first met — the HTML naming the new bundles is precisely the file that must never be stale. So pages are network-first, and the cached copy is a fallback rather than a preference.

Precached on install, pruned on activate, and never stored: a redirect, an error, an opaque response, or anything the server marked `no-store`.

### Which pages actually get cached

The worker stores nothing the server told it not to, and Janux's default for a
rendered page is `private, no-store` — the [fail-safe](/docs/guide/http-cache) a
route gets when it declares no `cachePolicy`. So out of the box:

| The page is | Cached for offline? |
|---|---|
| Prerendered (`output: 'static'`) | **Yes** — served as a file, with an ordinary revalidating header |
| Rendered per request, no `cachePolicy` | **No** — the response says `no-store`, and the worker obeys |
| Rendered per request, with a `cachePolicy` | **Yes**, within that policy |

This is deliberate, and it is one vocabulary rather than two: the sentence that
tells a CDN a page may be stored is the same sentence that tells the worker. It
also means a signed-in page does not silently end up in Cache Storage, where it
would outlive the session that produced it.

If a server-rendered page should be readable offline, say so on the route:

```ts
import { cachePolicy } from 'janux';

export const cache = cachePolicy({ name: 'guide', maxAge: '1h' });
```

### The offline fallback

`fallback` names a page for the case where a navigation fails **and** nothing is cached for that URL — someone opening a link they never visited, offline. It is an ordinary route, precached on install along with the assets:

```ts
offlineFirst({ fallback: '/offline' });
```

Without it, that navigation gets the browser's own error page.

### The page you are on

The page that installs a worker was downloaded before there was a worker to answer for it, so nothing cached it. `offlineFirst()` warms it on activate — it asks the browser which pages are open and caches those URLs. Otherwise an app would be offline-capable everywhere except the page the visitor is actually reading, and "works offline after the first visit" would quietly mean "after the second".

## Updates, and why a reload comes with them

This is the part that goes wrong.

By default a new worker installs and then **waits**, taking over only once every tab running the old one has closed. On an app people keep open that is never: you deploy, and nobody receives it.

`offlineFirst()` says the opposite. It calls `skipWaiting()` on install and `clients.claim()` on activate, so the new build takes over as soon as it has finished precaching, and the previous version's cache is deleted.

That deletion is why the registration script reloads the page once when a new worker takes control. The markup on screen names hashed chunks that, after the prune, exist neither in the cache nor on the server — so the next lazy import would fail. The reload is not a nicety; it is the other half of `skipWaiting`. It never fires on a first visit, where taking control is just the install finishing and there is nothing stale to replace.

One more case: the browser re-checks the worker on navigations, and an app that navigates client-side may not do a full page load for hours. So the registration script also re-checks when the tab becomes visible again — coming back to a tab is the moment a deploy is most likely to have happened.

If you want none of that, write the worker yourself.

## Writing your own

Drop `offlineFirst()` and keep the manifest, which was the only thing you needed the build for:

```ts
import { assets, version } from 'janux/service-worker';

const CACHE = `my-app-${version}`;

self.addEventListener('install', (event: any) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(assets)));
});
```

Everything else is an ordinary `addEventListener`. You can also keep `offlineFirst()` and add handlers of your own beside it — a `push` listener, say — since they are separate listeners on the same scope.

To keep the built worker but register it yourself, for instance behind a user setting:

```ts
// janux.config.ts
import { defineConfig } from 'janux';

export default defineConfig({
  serviceWorker: { register: false },
});
```

`/sw.js` is still built and served; only the automatic sign-up is withheld.

## Making it installable

The worker is what makes an app work offline. A **web app manifest** is what makes it installable. Put one in `public/` and the shell links it, by the same rule as the favicon — the file being there is the whole configuration:

```json
// public/manifest.webmanifest
{
  "name": "Basecamp — an offline trail companion",
  "short_name": "Basecamp",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#2f6b4f",
  "icons": [{ "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

Together — a worker that answers offline and a manifest that describes the app — that is a PWA. There is no plugin and no build step beyond `janux build`.

## With a strict CSP

`worker-src` has no default of its own: it falls back to `script-src`, and a worker script cannot carry a nonce the way a `<script>` tag can. Janux's [recommended policy](/docs/guide/cli-and-deployment) therefore states `worker-src 'self'` — same-origin workers allowed, nobody else's. An app sending its own policy needs to say the same thing.

## Where to look

- [`janux/service-worker`](/docs/reference/service-worker) — `assets`, `version`, `offlineFirst`, `ServiceWorkerConfig`
- [`examples/with-offline`](https://github.com/aralroca/Janux/tree/main/examples/with-offline) — a prerendered site that opens offline and survives a deploy
