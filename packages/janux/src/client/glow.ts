import { isMarkerAttr } from '../render/html';
import type { BootFeature } from './features';
import { feedbackSuspended, glowElement, injectGlowStyles, GLOW_CLASS, type ToolTargetDetail } from './feedback';

export { emitToolTarget, feedbackSuspended, glowElement, injectGlowStyles, suspendAgentGlow, GLOW_CLASS, type ToolTargetDetail } from './feedback';

/** ms a DOM-fallback target stays lit. Matches what `ui_click`/`ui_fill` used to paint themselves. */
const TARGET_GLOW_MS = 1200;

export interface GlowOptions {
  /** ms the glow lingers after the call finishes. Default 700. */
  duration?: number;
}

/**
 * Whether one of this element's attributes is `marker`'s delegation marker.
 * Events are open-ended (`data-jxe-<any event>`), so this checks the attribute
 * name's shape instead of enumerating a closed list.
 */
function carriesMarker(el: Element, marker: string): boolean {
  return [...el.attributes].some(({ name, value }) => value === marker && isMarkerAttr(name));
}

/**
 * `display: none` is not inherited, so the chain has to be walked; the loop
 * exits at the first hidden ancestor, which is the common case (an inactive
 * tab panel). `checkVisibility()` and `getClientRects()` would answer this in
 * one call, but neither is implemented by the DOM the test suite runs on.
 */
function isPainted(el: Element): boolean {
  if (el.closest('[hidden]')) return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const { display, visibility } = getComputedStyle(node);

    if (display === 'none' || visibility === 'hidden') return false;
  }

  return true;
}

/**
 * Which of several controls bound to one intent a call came through: a tab bar,
 * a table row, a list of "add to cart" buttons all carry the same marker, and
 * only the `data-input` they declare tells them apart. An agent may pass more
 * than a control declares, so the declared part is what has to match.
 */
function declares(el: Element, input: unknown): boolean {
  const raw = el.getAttribute('data-input');

  if (!raw || !input) return false;
  try {
    return Object.entries(JSON.parse(raw)).every(
      ([key, value]) => (input as Record<string, unknown>)[key] === value,
    );
  } catch {
    return false;
  }
}

/**
 * The element that carries the intent's delegation marker (`onClick={intents.x}`,
 * `<form onSubmit={intents.x}>`, `onInput={intents.x}` …), so the glow points at the exact
 * control the agent "pressed" — `input` picks between controls that share the
 * intent. Falls back to the whole island when the intent has no element in the
 * view, and to nothing at all when the target isn't painted — a ring around a
 * box with no geometry lands in the page corner, with the backdrop veil over
 * everything, which reads as a bug.
 */
export function glowTargetFor(tool: string, input?: unknown, scope: ParentNode = document): Element | undefined {
  const [component = '', intentName = ''] = tool.split('.');
  const island = scope.querySelector(`janux-island[data-jx^="${component}#"]`);

  if (!island) return undefined;
  const marker = `${island.getAttribute('data-jx')}:${intentName}`;
  const marked = [...island.querySelectorAll('*')].filter((el) => carriesMarker(el, marker));
  const bound = marked.find((el) => declares(el, input)) ?? marked[0];

  // A painted control implies a painted island, so that is the only walk needed.
  if (bound && isPainted(bound)) return bound;

  return isPainted(island) ? island : undefined;
}

/** Long enough for the frame on which a declared selector's target mounts (a React Flow node). */
const DECLARED_TARGET_RETRY_MS = 32;
const DECLARED_TARGET_TRIES = 10;

/**
 * Paints a declared `glowTarget` selector, waiting out the tick on which the
 * DOM the intent created mounts — pointing at an element on `ok` would be too
 * early, so the selector is retried for a few frames and then given up on.
 */
export function withDeclaredTarget(selector: string, paint: (el: Element) => void, tries = DECLARED_TARGET_TRIES): void {
  const el = document.querySelector(selector);

  if (el) return paint(el);
  if (tries > 0) setTimeout(() => withDeclaredTarget(selector, paint, tries - 1), DECLARED_TARGET_RETRY_MS);
}

/**
 * Highlights what an agent is operating (gui-agent style): listens to
 * `janux:tool-call` bridge events and glows the matching island — or, when the
 * intent declares a `glowTarget`, the exact element the run created — plus
 * `janux:tool-target` for the elements the DOM-fallback tools touch. Returns a
 * disposer. `boot({ glow: agentGlow() })` wires this for you.
 */
export function enableAgentGlow(options: GlowOptions = {}): () => void {
  const duration = options.duration ?? 700;
  // What this layer painted, so the closing phase clears that exact element:
  // re-resolving could come back empty (suspended mid-call, island no longer
  // painted) and `morph` keeps `janux-*` classes, so the glow would never fade.
  const lit = new Map<string, Element>();
  const onToolTarget = (event: Event): void => {
    const { element } = ((event as CustomEvent).detail ?? {}) as ToolTargetDetail;

    if (feedbackSuspended()) return;
    if (element) glowElement(element, TARGET_GLOW_MS);
  };
  const onToolCall = (event: Event): void => {
    const { tool, input, phase, guard, approval, glowTarget, glowTargetPending } = (event as CustomEvent).detail ?? {};

    // confirm-guarded calls only PROPOSE — nothing executes, nothing glows.
    // The glow fires on approval, when the action actually runs.
    if (guard === 'confirm' && !approval) return;
    if (phase !== 'start') {
      const painted = lit.get(tool);

      lit.delete(tool);
      if (painted) setTimeout(() => painted.classList.remove(GLOW_CLASS), duration);
      // The DOM a declared `glowTarget` names only exists after the run — a
      // React Flow node, a row an intent appended — so it is lit on `ok`.
      if (phase === 'ok' && glowTarget && !feedbackSuspended()) withDeclaredTarget(glowTarget, (el) => glowElement(el, duration));

      return;
    }
    if (feedbackSuspended()) return;
    // A declared target arrives with `ok`: guessing from the view now would
    // ring the island first and the intent's real target a moment later.
    if (glowTargetPending) return;
    const target = tool ? glowTargetFor(tool, input) : undefined;

    if (!target) return;
    lit.set(tool, target);
    target.classList.add(GLOW_CLASS);
  };

  injectGlowStyles();
  document.addEventListener('janux:tool-call', onToolCall);
  document.addEventListener('janux:tool-target', onToolTarget);

  return () => {
    document.removeEventListener('janux:tool-call', onToolCall);
    document.removeEventListener('janux:tool-target', onToolTarget);
  };
}

/**
 * The glow layer as a boot feature: `boot({ glow: agentGlow() })`. Importing it
 * is what ships it — `boot()` without it carries zero bytes of this module.
 */
export function agentGlow(options: GlowOptions = {}): BootFeature {
  return {
    install: () => {
      enableAgentGlow(options);
    },
  };
}
