/**
 * Shallow routing: change the URL without re-rendering the page.
 *
 * What a filter, a tab or a URL-addressable dialog needs — the address bar and
 * the back button have to be right, but the server has nothing new to say, so
 * fetching and diffing the same page would be a round trip to redraw what is
 * already on screen.
 *
 * `history.pushState` alone is not enough to build this on: it fires no event,
 * so nothing else in the page learns the URL moved. Every shallow change goes
 * through here and announces itself, which is what keeps `urlState` bindings —
 * all of them, in every island — reading the same URL.
 */

/** Fired on `document` after a shallow URL change. `urlState` listens for it. */
export const URL_CHANGE_EVENT = 'janux:urlchange';

export interface ShallowOptions {
  /** Replace the current history entry instead of pushing a new one. Default: false. */
  replace?: boolean;
}

/**
 * Points the URL at `url` and tells the page, without touching the DOM the
 * router owns. Islands bound to the query react; nothing re-renders.
 */
export function shallowNavigate(url: string, options: ShallowOptions = {}): void {
  const target = new URL(url, location.href);

  history[options.replace ? 'replaceState' : 'pushState']({}, '', `${target.pathname}${target.search}${target.hash}`);
  announceUrlChange();
}

/** Separate export because `urlState.set` writes the URL its own way and still has to announce. */
export function announceUrlChange(): void {
  document.dispatchEvent(new CustomEvent(URL_CHANGE_EVENT));
}
