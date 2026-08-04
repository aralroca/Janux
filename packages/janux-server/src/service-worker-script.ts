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

/** What the boot function touches, which is `window` and four of its members. */
export interface PageScope {
  navigator: { serviceWorker?: ServiceWorkerContainer };
  document: { hidden: boolean; addEventListener(type: string, handler: () => void): void };
  location: { reload(): void };
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

/** Keyed and nonced like every other script the shell emits — see `html-shell.ts`. */
export function serviceWorkerScript(url: string, nonce: string | undefined): string {
  return `<script key="jx-sw"${nonceAttr(nonce)}>(${bootServiceWorker})(${safeJson(url)},window)</script>`;
}
