import { KEEP_ATTRIBUTE } from './navigate';

/**
 * What a cross-document load gives a screen-reader user for free, and an SPA
 * navigation gives them not at all: the page changed, so say which page it is
 * now, and put focus at the top of the new content instead of leaving it on a
 * link the diff has just replaced (focus falls back to `<body>` — the reader
 * is silently dumped at the top of the document).
 *
 * https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/
 */

const ANNOUNCER_ID = 'janux-route-announcer';

/** A widget that opts into surviving navigations also owns its own focus. */
const PERSISTED = '[data-jx-persist]';

/**
 * Visually hidden, but NOT hidden from assistive technology: `display:none` and
 * `visibility:hidden` would drop it out of the accessibility tree too, which is
 * the one thing this element cannot afford. Clipped to a 1px box taken out of
 * the flow instead, so it occupies no layout space and can never be read on
 * screen. `white-space:nowrap` keeps the text from being smushed into that box
 * (https://medium.com/@jessebeach/beware-smushed-off-screen-accessible-text-5952a4c2cbfe).
 */
const ANNOUNCER_STYLE =
  'position:absolute;top:0;left:0;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';

const ANNOUNCER_ATTRIBUTES: Record<string, string> = {
  id: ANNOUNCER_ID,
  // Assertive: the page the user asked for is already on screen, so this is not
  // something to mention once they finish reading the previous page.
  'aria-live': 'assertive',
  // Without it a reader may speak only the words that changed between two
  // titles, which is how "Quick start | Janux" becomes "Quick".
  'aria-atomic': 'true',
  // No `role`: `alert` and `status` carry their own implicit politeness (and
  // readers that prefix "Alert" describe this as something it is not).
  style: ANNOUNCER_STYLE,
};

/**
 * Long enough for a reader to notice the region changed. Filling a live region
 * in the same task that inserts (or empties) it is routinely missed — the
 * number is Astro's, arrived at the same way.
 */
const ANNOUNCE_DELAY_MS = 60;

/** Focus target priority: the new page's heading, then whatever wraps its content. */
const CONTENT_TARGETS = ['h1', 'main', '[role="main"]'];

export interface SavedFocus {
  element: HTMLElement;
  start: number | null;
  end: number | null;
}

function createAnnouncer(): HTMLElement {
  const announcer = document.createElement('p');

  // The announcer belongs to the session, not to the route: without the keep
  // marker the whole-document diff owns it, and the next page deletes it.
  Object.entries({ ...ANNOUNCER_ATTRIBUTES, [KEEP_ATTRIBUTE]: '' }).forEach(([name, value]) =>
    announcer.setAttribute(name, value),
  );
  document.body.appendChild(announcer);

  return announcer;
}

function ensureAnnouncer(): HTMLElement {
  return document.getElementById(ANNOUNCER_ID) ?? createAnnouncer();
}

/**
 * What a full page load would have announced: the document title, falling back
 * to the heading and then to the path, so a route that ships neither is still
 * not silent.
 */
export function routeTitle(): string {
  return document.title || document.querySelector('h1')?.textContent?.trim() || location.pathname;
}

/**
 * Cleared and filled in two separate turns: a live region speaks when its
 * content CHANGES, so navigating between two pages that happen to share a title
 * would otherwise be silent.
 */
export function announceRoute(): void {
  const announcer = ensureAnnouncer();

  announcer.textContent = '';
  setTimeout(() => {
    // Read late on purpose: if a further navigation superseded this one, the
    // title to announce is the one on screen, not the one this call started for.
    announcer.textContent = routeTitle();
  }, ANNOUNCE_DELAY_MS);
}

function contentTarget(): HTMLElement | null {
  return CONTENT_TARGETS.reduce<HTMLElement | null>(
    (found, selector) => found ?? document.querySelector<HTMLElement>(selector),
    null,
  );
}

function focusContent(): void {
  const target = contentTarget();

  if (!target) return;
  // A heading is not focusable on its own; `-1` allows programmatic focus
  // without adding it to the tab order. The incoming page never carries the
  // attribute, so the next diff strips it back off.
  target.setAttribute('tabindex', '-1');
  // Scrolling is the Navigation API's job here (`scroll: 'after-transition'`);
  // focusing must not race it to a different position.
  target.focus({ preventScroll: true });
}

/**
 * Focus that must NOT be stolen: it sits inside a widget the app declared
 * `persist`, which survives the navigation by design and manages its own focus
 * — a docs assistant, a command palette. It still has to be restored rather
 * than merely left alone: the navigation lifts persisted islands out of the
 * document before the diff, and removing a node blurs it.
 *
 * Called before the diff, while the widget is still in the document.
 */
export function saveWidgetFocus(): SavedFocus | undefined {
  const active = document.activeElement as HTMLElement | null;

  if (!active?.closest?.(PERSISTED)) return undefined;
  const field = active as HTMLInputElement;

  // `selectionStart` is null on inputs that do not support selection (number,
  // email…), which is exactly the guard `setSelectionRange` needs — it throws
  // on those.
  return { element: active, start: field.selectionStart ?? null, end: field.selectionEnd ?? null };
}

/** `false` when the widget did not survive the navigation, so there is nothing to restore to. */
function restoreWidgetFocus({ element, start, end }: SavedFocus): boolean {
  if (!element.isConnected) return false;
  element.focus({ preventScroll: true });
  if (start !== null && end !== null) (element as HTMLInputElement).setSelectionRange(start, end);

  return true;
}

/**
 * Run once the new page is on screen and settled — after the diff, and after
 * the view transition when there is one. Announcing mid-transition describes a
 * document the user cannot act on yet, and moving focus during one makes the
 * browser animate from a scroll position that is about to change.
 */
export function settleRouteA11y(saved?: SavedFocus): void {
  // A widget the incoming page does not render is disposed mid-navigation, and
  // the focus saved into it goes with it — that is a page change with nowhere
  // to return to, so it falls back to the new content rather than stranding the
  // reader on `<body>`.
  if (!saved || !restoreWidgetFocus(saved)) focusContent();
  // Either way the page changed, so either way it is announced.
  announceRoute();
}
