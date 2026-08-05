/**
 * The inline script that registers the app's service worker.
 *
 * Shipped as source — the function below is stringified into the shell, the
 * same trick `worker()` uses — rather than written as a string literal, so the
 * page's half of the lifecycle is ordinary typed code with ordinary tests. It
 * follows that it must be self-contained: it sees its two arguments and
 * nothing else, so every helper is inline.
 */
import { nonceAttr, safeJson } from './html-escape';

/** What the boot functions touch, which is `window` and five of its members. */
export interface PageScope {
  navigator: { serviceWorker?: ServiceWorkerContainer };
  document: { hidden: boolean; addEventListener(type: string, handler: () => void): void };
  location: { reload(): void };
  caches: CacheStorage;
  addEventListener(type: string, handler: () => void): void;
}

/**
 * Runs in the page.
 *
 * `controlled` is read now, before any new worker can claim this page, and it
 * is the whole reason the reload is safe: on a first visit there is no
 * controller, so the install claiming the page is not an update and reloading
 * would be gratuitous. On a return visit there is one, so a controller change
 * means a NEW build just took over — and since that build has already deleted
 * the previous version's cache, the markup on screen now names chunks that
 * exist nowhere. Reloading is what finishes the update instead of leaving a
 * page that will fail at its next lazy import.
 *
 * `visibilitychange` covers the case a full page load never comes: the browser
 * re-checks the worker on navigations, and an app people leave open navigates
 * client-side. Coming back to the tab is the moment worth asking again.
 */
export function bootServiceWorker(url: string, page: PageScope): void {
  const container = page.navigator.serviceWorker;

  if (!container) return;
  const controlled = Boolean(container.controller);

  container.addEventListener('controllerchange', function takeOver() {
    if (controlled) page.location.reload();
  });
  page.addEventListener('load', function registerWorker() {
    container.register(url).then(function watchForUpdates(registration) {
      page.document.addEventListener('visibilitychange', function recheck() {
        if (!page.document.hidden) registration.update();
      });
    }, function report(error) {
      // A worker that cannot register must not take the page down with it:
      // an insecure origin is the usual cause, and the app works without one.
      console.warn('Janux: service worker registration failed', error);
    });
  });
}

/**
 * Runs in the page under `janux dev`, and almost always does nothing.
 *
 * Declining to register a worker is not the same as not having one. A worker is
 * scoped to an origin, not to a process, so `janux dev --port 4340` inherits
 * whatever `janux start --port 4340` installed an hour ago: the page comes up
 * served by a build that no longer exists, `/styles.css` is answered from a
 * cache Vite knows nothing about, and the developer sees an unstyled page with
 * no visible cause. Dev therefore reclaims the origin.
 *
 * Guarded on `controller`, so a session with no worker — nearly all of them —
 * touches nothing. `janux-` caches only: the app's own are not ours to drop.
 * The reload is what puts the page back under Vite, and the log is what stops
 * that reload from looking like a haunting.
 */
export function unregisterStaleServiceWorker(page: PageScope): void {
  const container = page.navigator.serviceWorker;

  if (!container || !container.controller) return;
  console.info('Janux: unregistering a service worker left on this origin by a production build — reloading.');
  container
    .getRegistrations()
    .then(function drop(registrations) {
      return Promise.all(registrations.map((registration) => registration.unregister()));
    })
    .then(function reload() {
      page.location.reload();
    });
}

/**
 * The second half, and it runs on the load *after* the unregistration: while a
 * worker is still controlling the page it keeps answering — and caching —
 * requests, so a delete issued in the same breath races the very worker being
 * retired and loses. Observed as a `janux-` cache full of Vite's `/@fs/` module
 * URLs: emptied, then refilled by the worker before the reload landed.
 *
 * Uncontrolled, nothing is repopulating them, so the leftovers can simply go.
 */
export function dropStaleServiceWorkerCaches(page: PageScope): void {
  if (!page.caches || page.navigator.serviceWorker?.controller) return;
  page.caches
    .keys()
    .then(function dropJanuxCaches(names) {
      return Promise.all(names.filter((name) => name.indexOf('janux-') === 0).map((name) => page.caches.delete(name)));
    })
    .catch(function ignore() {
      // Best-effort tidying: a storage error here must not disturb the page.
    });
}

/** Keyed and nonced like every other script the shell emits — see `html-shell.ts`. */
export function serviceWorkerScript(url: string, nonce: string | undefined): string {
  return `<script key="jx-sw"${nonceAttr(nonce)}>(${bootServiceWorker})(${safeJson(url)},window)</script>`;
}

/**
 * The dev counterpart: reclaim the origin from a worker nobody meant to keep.
 * Both halves ship together and each decides for itself whether this is its
 * load — the first is controlled, the one after it is not.
 */
export function reclaimServiceWorkerScript(nonce: string | undefined): string {
  const calls = `(${unregisterStaleServiceWorker})(window);(${dropStaleServiceWorkerCaches})(window)`;

  return `<script key="jx-sw-reclaim"${nonceAttr(nonce)}>${calls}</script>`;
}
