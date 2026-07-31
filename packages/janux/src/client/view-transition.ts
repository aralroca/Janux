import { shellNavigationConfig } from './speculation';

/**
 * The View Transitions API around a navigation's DOM swap: ONE transition for
 * the whole page, so elements sharing a `view-transition-name` are paired
 * across routes and carried from the old page into the new one.
 *
 * One, not one per streamed chunk. `diff-dom-streaming` can wrap every mutation
 * it applies (`transition: true`), but shared elements are paired by comparing a
 * snapshot of the WHOLE old page against the whole new one, and each new
 * transition skips the one before it — measured on a real navigation that is 51
 * transitions started, 50 skipped and one animating the last fragment. It can
 * never produce the morph this exists for.
 *
 * https://developer.mozilla.org/docs/Web/API/View_Transition_API
 */

/** The slice of `ViewTransition` used here — the DOM lib may predate the API. */
interface ViewTransition {
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

type TransitionStarter = (callback: () => Promise<void>) => ViewTransition;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The transition still on screen, if any: a new navigation has to cut it short. */
let active: ViewTransition | undefined;

function starter(): TransitionStarter | undefined {
  const start = (document as unknown as { startViewTransition?: TransitionStarter }).startViewTransition;

  return typeof start === 'function' ? start.bind(document) : undefined;
}

/**
 * Read per navigation, never cached: the config arrives with the page, and the
 * motion preference can change mid-session (a reader turning it on is asking
 * for the animation to stop NOW, not on the next reload).
 */
function wanted(): boolean {
  return (
    shellNavigationConfig().viewTransitions === true &&
    // A user asking for less motion is not a preference to weigh against a demo.
    !window.matchMedia?.(REDUCED_MOTION).matches
  );
}

/**
 * Whether this navigation will be animated — the caller needs to know BEFORE
 * the swap, because a transition changes how the page has to be applied.
 */
export function viewTransitionsWanted(): boolean {
  return wanted() && !!starter();
}

/** Cuts the previous transition short, so its snapshot never outlives its navigation. */
function skipActive(): void {
  active?.skipTransition();
  active = undefined;
}

function track(transition: ViewTransition): void {
  active = transition;
  // `finished` rejects when a transition is skipped, which is a normal outcome
  // here — an unhandled rejection would surface as a navigation failure.
  transition.finished
    .catch(() => {})
    .then(() => {
      if (active === transition) active = undefined;
    });
}

/**
 * Runs `swap` inside a view transition when the app asked for one and the
 * platform and the user allow it; plainly otherwise, which is the whole of the
 * degradation story.
 *
 * Resolves when the DOM has been updated — NOT when the animation ends, so the
 * new page's islands mount while it plays instead of after it.
 */
export function applyWithViewTransition(swap: () => Promise<void>, signal?: AbortSignal): Promise<void> {
  skipActive();
  const start = wanted() ? starter() : undefined;

  if (!start) return swap();
  const transition = start(swap);

  track(transition);
  // A superseded navigation must not leave the old snapshot painted over a
  // document that has already moved on — that is the frozen frame.
  signal?.addEventListener('abort', () => transition.skipTransition(), { once: true });

  return transition.updateCallbackDone;
}

/**
 * Settles once the transition has finished animating. Awaited before the route
 * announcement and the focus move: both belong after the transition, not
 * inside it — announcing mid-transition describes a document the user cannot
 * act on yet.
 */
export function viewTransitionSettled(): Promise<void> {
  return active?.finished.catch(() => {}) ?? Promise.resolve();
}
