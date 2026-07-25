export const GLOW_CLASS = 'janux-agent-glow';

/** ms a DOM-fallback target stays lit. Matches what `ui_click`/`ui_fill` used to paint themselves. */
const TARGET_GLOW_MS = 1200;

export interface GlowOptions {
  /** ms the glow lingers after the call finishes. Default 700. */
  duration?: number;
}

/**
 * The element a DOM-fallback client tool (`ui_click` / `ui_fill`) just resolved,
 * reported on `janux:tool-target` right before it acts. The tools never paint:
 * whichever feedback layer is enabled decides what the user sees — the built-in
 * glow below, or a richer visualizer.
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

/* !important: the glow is runtime-owned feedback and must win over inline
   view styles (e.g. a button that sets its own box-shadow). */
const GLOW_CSS = `
.${GLOW_CLASS} {
  box-shadow: 0 0 0 3px var(--janux-glow-ring, rgba(124, 58, 237, 0.55)),
    0 0 var(--janux-glow-spread, 34px) 4px var(--janux-glow-halo, rgba(34, 211, 238, 0.35)) !important;
  border-radius: var(--janux-glow-radius, 18px);
  transition: box-shadow 0.25s;
}`;

/** Idempotently installs the default glow styles. Override via the --janux-glow-* CSS vars. */
export function injectGlowStyles(doc: Document = document): void {
  if (doc.getElementById('janux-glow-styles')) return;
  const style = doc.createElement('style');

  style.id = 'janux-glow-styles';
  style.textContent = GLOW_CSS;
  doc.head.appendChild(style);
}

/** Glows one element now, fading after `duration` ms. */
export function glowElement(el: Element, duration = 700): void {
  el.classList.add(GLOW_CLASS);
  setTimeout(() => el.classList.remove(GLOW_CLASS), duration);
}

/**
 * The element that carries the intent's delegation marker (`on={intents.x}` /
 * `<form intent>`), so the glow points at the exact control the agent "pressed".
 * Falls back to the whole island when the intent has no element in the view.
 */
export function glowTargetFor(tool: string, scope: ParentNode = document): Element | undefined {
  const [component = '', intentName = ''] = tool.split('.');
  const island = scope.querySelector(`janux-island[data-jx^="${component}#"]`);

  if (!island) return undefined;
  const marker = `${island.getAttribute('data-jx')}:${intentName}`;

  return (
    island.querySelector(`[data-jxa="${marker}"], [data-jxform="${marker}"]`) ?? island
  );
}

/**
 * Highlights what an agent is operating (gui-agent style): listens to
 * `janux:tool-call` bridge events and glows the matching island, plus
 * `janux:tool-target` for the elements the DOM-fallback tools touch. Returns a
 * disposer. `boot({ glow: true })` wires this for you.
 */
export function enableAgentGlow(options: GlowOptions = {}): () => void {
  const duration = options.duration ?? 700;
  const onToolTarget = (event: Event): void => {
    const { element } = ((event as CustomEvent).detail ?? {}) as ToolTargetDetail;

    if (element) glowElement(element, TARGET_GLOW_MS);
  };
  const onToolCall = (event: Event): void => {
    const { tool, phase, guard, approval } = (event as CustomEvent).detail ?? {};
    const target = tool ? glowTargetFor(tool) : undefined;

    if (!target) return;
    // confirm-guarded calls only PROPOSE — nothing executes, nothing glows.
    // The glow fires on approval, when the action actually runs.
    if (guard === 'confirm' && !approval) return;
    if (phase === 'start') target.classList.add(GLOW_CLASS);
    else setTimeout(() => target.classList.remove(GLOW_CLASS), duration);
  };

  injectGlowStyles();
  document.addEventListener('janux:tool-call', onToolCall);
  document.addEventListener('janux:tool-target', onToolTarget);

  return () => {
    document.removeEventListener('janux:tool-call', onToolCall);
    document.removeEventListener('janux:tool-target', onToolTarget);
  };
}
