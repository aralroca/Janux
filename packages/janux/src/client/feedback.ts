import { applyNonce } from './nonce';

export const GLOW_CLASS = 'janux-agent-glow';

/**
 * The element a DOM-fallback client tool (`ui_click` / `ui_fill`) just resolved,
 * reported on `janux:tool-target` right before it acts. The tools never paint:
 * whichever feedback layer is enabled decides what the user sees — the built-in
 * glow, or a richer visualizer.
 */
export interface ToolTargetDetail {
  element: Element;
  action: 'click' | 'fill';
  selector: string;
}

/** Announces the live element a client tool is about to operate. */
export function emitToolTarget(detail: ToolTargetDetail): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent('janux:tool-target', { detail }));
}

let suspensions = 0;

/** Whether a richer feedback layer currently holds the painting claim. Shared by every built-in layer. */
export function feedbackSuspended(): boolean {
  return suspensions > 0;
}

/**
 * Hands the agent feedback over to a richer layer (status chips, an animated
 * ring, a backdrop veil): the events keep flowing, but the built-in layers —
 * the glow and the simulated cursor — stop painting so two layers never
 * highlight the same element at once. Returns a resume function; nested
 * suspensions each hold their own claim.
 */
export function suspendAgentGlow(): () => void {
  let released = false;

  suspensions += 1;

  return () => {
    if (released) return;
    released = true;
    suspensions -= 1;
  };
}

/* !important: the glow is runtime-owned feedback and must win over inline
   view styles (e.g. a button that sets its own box-shadow). */
const GLOW_CSS = `
.${GLOW_CLASS} {
  box-shadow: 0 0 0 3px var(--janux-glow-ring, rgba(37, 99, 235, 0.55)),
    0 0 var(--janux-glow-spread, 34px) 4px var(--janux-glow-halo, rgba(34, 211, 238, 0.35)) !important;
  border-radius: var(--janux-glow-radius, 18px);
  transition: box-shadow 0.25s;
}`;

/** Idempotently installs the default glow styles. Override via the --janux-glow-* CSS vars. */
export function injectGlowStyles(doc: Document = document): void {
  if (doc.getElementById('janux-glow-styles')) return;
  const style = doc.createElement('style');

  style.id = 'janux-glow-styles';
  applyNonce(style);
  style.textContent = GLOW_CSS;
  doc.head.appendChild(style);
}

/** Glows one element now, fading after `duration` ms. */
export function glowElement(el: Element, duration = 700): void {
  el.classList.add(GLOW_CLASS);
  setTimeout(() => el.classList.remove(GLOW_CLASS), duration);
}
