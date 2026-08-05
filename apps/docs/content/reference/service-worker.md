---
title: janux/service-worker
description: The build's asset manifest and the default offline-first caching strategy, for an app's src/sw.ts.
---

# janux/service-worker

What an app's `src/sw.ts` imports. The file existing is the opt-in: with no `src/sw.ts` nothing is built, nothing is registered, and the HTML is byte for byte what it was before.

```ts
import { assets, offlineFirst, version } from 'janux/service-worker';
```

Runnable version: [`examples/with-offline`](https://github.com/aralroca/Janux/tree/main/examples/with-offline). The narrative version is [the guide](/docs/guide/service-workers).

## offlineFirst()

Installs the default strategy: precache on install, prune old caches on activate, cache-first for build output and network-first for everything else.

```ts
function offlineFirst(options?: OfflineOptions): void;

interface OfflineOptions {
  assets?: string[];
  fallback?: string;
}
```

The whole of a typical worker:

```ts
import { offlineFirst } from 'janux/service-worker';

offlineFirst({ fallback: '/offline' });
```

`assets` defaults to this build's `assets`. `fallback` is a page answered when a navigation fails offline **and** nothing is cached for that URL; it is precached along with the assets, because a fallback fetched on demand is missing exactly when it is wanted.

## assets

Every file of the built client worth precaching, as the URL paths a page requests them by.

```ts
const assets: string[];
// ['/assets/app-a1b2c3d4.js', '/client.js', '/favicon.svg', '/styles.css']
```

Substituted by `janux build`, which is the only thing that can know them: the names are decided by the bundler, and a worker cannot read its own build. Outside a build — a unit test, `janux dev` — it is `[]`, so importing the module never throws.

Documents are deliberately absent. Sourcemaps, `.md` page projections and `islands.json` are absent too: nothing a page fetches, so precaching them would only make a first visit slower.

## version

This build's id — a hash of the name **and** the bytes of everything in `assets`.

```ts
const version: string; // '63fd350b1adb0d90', or 'dev' outside a build
```

It names the cache, which is what makes a deploy start from a clean one and the previous deploy's cache collectable. Bytes rather than names alone, because `/styles.css` and `public/` files carry no content hash: an app whose only change was an image would otherwise ship under the old version and every visitor would keep the old copy forever.

## Writing your own

Skip `offlineFirst()`. `assets` and `version` are the only things you needed the build for; everything else is an ordinary worker.

```ts
import { assets, version } from 'janux/service-worker';

const CACHE = `my-app-${version}`;

self.addEventListener('install', (event: any) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(assets)));
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
});
```

Two things `offlineFirst()` does that are easy to leave out and expensive to miss: `skipWaiting()` on install and `clients.claim()` on activate. Without them a new worker sits idle until every tab of the old one closes, which on an app people leave open is never. See [the guide](/docs/guide/service-workers) for why the reload that accompanies them is not optional either.

## Config

`janux.config.ts` says nothing about whether there is a worker — `src/sw.ts` does — only about who registers it.

```ts
interface ServiceWorkerConfig {
  register?: boolean;
}
```

```ts
import { defineConfig } from 'janux';

export default defineConfig({
  serviceWorker: { register: false },
});
```

`register: false` still builds and serves `/sw.js`; it only withholds the automatic sign-up, for when registration is conditional and you would rather call `navigator.serviceWorker.register('/sw.js')` yourself.
