export const GLOW_CLASS = 'janux-agent-glow';

export interface GlowOptions {
  /** ms the glow lingers after the call finishes. Default 700. */
  duration?: number;
}

const GLOW_CSS = `
.${GLOW_CLASS} {
  box-shadow: 0 0 0 3px var(--janux-glow-ring, rgba(124, 58, 237, 0.55)),
    0 0 var(--janux-glow-spread, 34px) 4px var(--janux-glow-halo, rgba(34, 211, 238, 0.35));
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

function islandFor(tool: string): Element | undefined {
  const component = tool.split('.')[0];

  return document.querySelector(`janux-island[data-jx^="${component}#"]`) ?? undefined;
}

/**
 * Highlights the island an agent is operating (gui-agent style): listens to
 * `janux:tool-call` bridge events and glows the matching island. Returns a
 * disposer. `boot({ glow: true })` wires this for you.
 */
export function enableAgentGlow(options: GlowOptions = {}): () => void {
  const duration = options.duration ?? 700;
  const onToolCall = (event: Event): void => {
    const { tool, phase } = (event as CustomEvent).detail ?? {};
    const island = tool ? islandFor(tool) : undefined;

    if (!island) return;
    if (phase === 'start') island.classList.add(GLOW_CLASS);
    else setTimeout(() => island.classList.remove(GLOW_CLASS), duration);
  };

  injectGlowStyles();
  document.addEventListener('janux:tool-call', onToolCall);

  return () => document.removeEventListener('janux:tool-call', onToolCall);
}
