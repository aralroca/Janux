/**
 * Where each history entry was scrolled to, and how the next page should open.
 *
 * The browser does this for cross-document loads, and the Navigation API offers
 * to do it for intercepted ones (`scroll: 'after-transition'`). That offer does
 * not survive a streamed SPA swap: the browser restores against whatever the
 * document measures at that instant, and a page whose content is still arriving
 * is far too short to hold the old offset — the reader lands at the top of a
 * list they had already scrolled through. So the router asks for
 * `scroll: 'manual'` and owns the sequence instead.
 */

/** Offsets by history entry key. A session's worth — a reload starts over, like the browser's own. */
const positions = new Map<string, number>();

export interface ScrollPlan {
  /** The history entry being navigated TO, when the platform names it. */
  key?: string;
  /** A traversal (back/forward) returns to a remembered offset; anything else is a new page. */
  traverse: boolean;
}

function currentKey(): string | undefined {
  return (window as any).navigation?.currentEntry?.key;
}

/**
 * Called while the `navigate` event is still on the page being left, which is
 * the only moment its offset and its entry key are both true at once.
 */
export function rememberScroll(): void {
  const key = currentKey();

  if (key) positions.set(key, window.scrollY);
}

export function scrollPlanFor(event: any): ScrollPlan {
  return { key: event.destination?.key, traverse: event.navigationType === 'traverse' };
}

/** The fragment the URL asks for, when the incoming page actually rendered it. */
function hashTarget(): HTMLElement | null {
  // Optional: scrolling must never be the thing that fails a navigation, and
  // not every environment the runtime is exercised in has a whole Location.
  const id = location.hash?.slice(1);

  if (!id) return null;

  return document.getElementById(decodeURIComponent(id));
}

/**
 * Applied as the last step of the swap, so a view transition animates a page
 * that is already at its final offset — scrolling after the animation would
 * show the new page arriving and then jumping.
 */
export function applyScrollPlan(plan: ScrollPlan = { traverse: false }): void {
  const remembered = plan.traverse ? positions.get(plan.key ?? '') : undefined;

  if (remembered !== undefined) return window.scrollTo(0, remembered);
  // `scroll: 'manual'` also took the anchor jump away from the browser.
  const anchor = hashTarget();

  if (anchor) return anchor.scrollIntoView();
  // A traversal with nothing remembered keeps its position rather than
  // inventing one; a new page opens where every new page opens.
  if (!plan.traverse) window.scrollTo(0, 0);
}
