/**
 * The whole service worker.
 *
 * The file existing is what opts this app in — `janux build` bundles it to
 * `/sw.js` with the manifest of the assets it just emitted, and the pages
 * register it. Delete the file and the app goes back to having no worker at
 * all, with nothing else to undo.
 *
 * `fallback` is the page a navigation gets when there is no network AND
 * nothing cached for that URL — a trail you have not opened before. It is
 * precached along with the assets, so it is there on the one occasion it is
 * needed.
 *
 * To write your own instead: drop `offlineFirst()` and use `assets` and
 * `version` — the two things only the build can tell you — with ordinary
 * `addEventListener('install' | 'activate' | 'fetch')` handlers.
 */
import { offlineFirst } from 'janux/service-worker';

offlineFirst({ fallback: '/offline' });
