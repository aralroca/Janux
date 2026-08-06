import { feedbackSuspended, type ToolTargetDetail } from './feedback';
import type { BootFeature } from './features';
import { glowTargetFor, withDeclaredTarget } from './glow';
import { KEEP_ATTRIBUTE } from './navigate';
import { applyNonce } from './nonce';

/** The overlay's element id — style it via `#janux-agent-cursor` or the --janux-cursor-* CSS vars. */
export const CURSOR_ID = 'janux-agent-cursor';

/** ms the cursor stays on screen after its last movement. */
const CURSOR_LINGER_MS = 1500;

export interface CursorOptions {
  /** ms the cursor lingers after the last agent action. Default 1500. */
  duration?: number;
}

/*
 * The cursor is its own fixed overlay, so no view style competes with it and
 * no !important is needed. Look and pace override via the --janux-cursor-*
 * CSS vars — the same contract the glow offers with --janux-glow-*.
 * The negative margin parks the arrow's tip (not its box corner) on the target.
 */
const CURSOR_CSS = `
#${CURSOR_ID} {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483646;
  width: var(--janux-cursor-size, 26px);
  height: var(--janux-cursor-size, 26px);
  margin: -3px 0 0 -5px;
  pointer-events: none;
  opacity: 0;
  filter: drop-shadow(0 0 var(--janux-cursor-spread, 12px) var(--janux-cursor-halo, rgba(34, 211, 238, 0.65)));
  transition: transform var(--janux-cursor-travel, 0.6s) cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s;
}
#${CURSOR_ID}.on { opacity: 1; }
#${CURSOR_ID} path {
  fill: var(--janux-cursor-fill, #fff);
  stroke: var(--janux-cursor-ring, rgba(37, 99, 235, 0.9));
  stroke-width: 1.5;
}`;

const ARROW_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5 L5 19.5 L9.4 15.6 L12.3 21.9 L15.2 20.5 L12.4 14.3 L18.3 13.8 Z"/></svg>';

/** Past the default --janux-cursor-travel, so the correction measures a settled layout. */
const SETTLE_MS = 700;

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/** Idempotently installs the cursor styles. Override via the --janux-cursor-* CSS vars. */
export function injectCursorStyles(doc: Document = document): void {
  if (doc.getElementById('janux-cursor-styles')) return;
  const style = doc.createElement('style');

  style.id = 'janux-cursor-styles';
  applyNonce(style);
  style.textContent = CURSOR_CSS;
  doc.head.appendChild(style);
}

function createCursor(): HTMLElement {
  const cursor = document.createElement('div');

  cursor.id = CURSOR_ID;
  // An unmarked body extra would be dropped by the SPA navigation's whole-document diff.
  cursor.setAttribute(KEEP_ATTRIBUTE, '');
  cursor.innerHTML = ARROW_SVG;
  // The first journey starts from the middle of the screen.
  cursor.style.transform = `translate(${innerWidth / 2}px, ${innerHeight / 2}px)`;
  document.body.appendChild(cursor);
  // Flush the centered position so the first move animates from it, not from (0,0).
  cursor.getBoundingClientRect();

  return cursor;
}

function cursorOverlay(): HTMLElement {
  return (document.getElementById(CURSOR_ID) as HTMLElement | null) ?? createCursor();
}

function placeAt(cursor: HTMLElement, el: Element): void {
  const { left, top, width, height } = el.getBoundingClientRect();

  cursor.style.transform = `translate(${left + width / 2}px, ${top + height / 2}px)`;
}

/** Travels the cursor to `el`'s center now, fading out `duration` ms after the last move. */
export function moveCursorTo(el: Element, duration = CURSOR_LINGER_MS): void {
  const cursor = cursorOverlay();

  cursor.classList.add('on');
  placeAt(cursor, el);
  clearTimeout(hideTimer);
  clearTimeout(settleTimer);
  // The page can keep laying out under a travelling cursor (React Flow re-fits
  // its canvas after a node mounts): re-measure once the travel settles, so the
  // arrow follows the element instead of parking where it used to be.
  settleTimer = setTimeout(() => el.isConnected && placeAt(cursor, el), SETTLE_MS);
  hideTimer = setTimeout(() => cursor.classList.remove('on'), duration);
}

/**
 * A simulated cursor that travels element to element as an agent operates the
 * page (gui-agent style): fed by the same events as the glow — `janux:tool-call`
 * for intents, `janux:tool-target` for the DOM-fallback tools — so the two
 * layers combine freely: both, either, or neither. `suspendAgentGlow` stands
 * this layer down too. Returns a disposer. `boot({ cursor: agentCursor() })`
 * wires this for you.
 */
export function enableAgentCursor(options: CursorOptions = {}): () => void {
  const duration = options.duration ?? CURSOR_LINGER_MS;
  const onToolTarget = (event: Event): void => {
    const { element } = ((event as CustomEvent).detail ?? {}) as ToolTargetDetail;

    if (feedbackSuspended()) return;
    if (element) moveCursorTo(element, duration);
  };
  const onToolCall = (event: Event): void => {
    const { tool, input, phase, guard, approval, glowTarget, glowTargetPending } = (event as CustomEvent).detail ?? {};

    // Mirrors the glow: confirm-guarded calls only propose — the cursor moves on approval.
    if (guard === 'confirm' && !approval) return;
    if (feedbackSuspended()) return;
    // The DOM a declared `glowTarget` names mounts after the run: travel to it on `ok`.
    if (phase === 'ok' && glowTarget) return withDeclaredTarget(glowTarget, (el) => moveCursorTo(el, duration));
    if (phase !== 'start' || !tool || glowTargetPending) return;
    const target = glowTargetFor(tool, input);

    if (target) moveCursorTo(target, duration);
  };

  injectCursorStyles();
  document.addEventListener('janux:tool-call', onToolCall);
  document.addEventListener('janux:tool-target', onToolTarget);

  return () => {
    document.removeEventListener('janux:tool-call', onToolCall);
    document.removeEventListener('janux:tool-target', onToolTarget);
    clearTimeout(hideTimer);
    clearTimeout(settleTimer);
    document.getElementById(CURSOR_ID)?.remove();
  };
}

/**
 * The simulated cursor as a boot feature: `boot({ cursor: agentCursor() })`.
 * Importing it is what ships it — `boot()` without it carries zero bytes of
 * this module.
 */
export function agentCursor(options: CursorOptions = {}): BootFeature {
  return {
    install: () => {
      enableAgentCursor(options);
    },
  };
}
