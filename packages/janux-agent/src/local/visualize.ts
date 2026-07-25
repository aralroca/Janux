/**
 * The copilot's visualization layer: gui-agent's visualizer (status chips per
 * tool call, an animated gradient ring around the element being operated, a
 * backdrop veil that blurs the rest of the page) driven by the runtime's two
 * feedback events — `janux:tool-call` for the app's own intents and
 * `janux:tool-target` for the DOM-fallback tools.
 *
 * It lives in the framework rather than in each app because every Janux app has
 * the same two events to visualize, and getting the overlay to survive island
 * re-renders and navigations is runtime knowledge.
 */
import { createAgentVisualizer, type AgentVisualizer, type AgentVisualizerOptions } from '@aralroca/gui-agent/ui';
import { glowTargetFor, suspendAgentGlow, KEEP_ATTRIBUTE } from 'janux/client';

/** Marks the chip-list host, so apps position and theme it from their own CSS. */
export const STEPS_ATTRIBUTE = 'data-janux-agent-steps';

/** gui-agent's ring host, created lazily on first highlight. */
const RING_SELECTOR = '[data-gui-agent-highlight]';

export interface Visualization {
  visualizer: AgentVisualizer;
  dispose(): void;
}

/**
 * Rings `target` and claims whatever host gui-agent lazily created for it: the
 * ring lives in `<body>`, so without the marker a navigation's document diff
 * would take it down for good and the glow would silently stop working.
 */
function highlight(visualizer: AgentVisualizer, target: Element | string | undefined): void {
  if (!target) return;
  visualizer.highlight(target);
  document.querySelector(RING_SELECTOR)?.setAttribute(KEEP_ATTRIBUTE, '');
}

/** Places the chip host outside every island, where no re-render owns it. */
function mountSteps(host: HTMLElement, container: Element | undefined): void {
  host.setAttribute(STEPS_ATTRIBUTE, '');
  host.setAttribute(KEEP_ATTRIBUTE, '');
  if (!container) document.body.appendChild(host);
}

export function startVisualization(options: AgentVisualizerOptions): Visualization {
  const visualizer = createAgentVisualizer(options);
  const resumeGlow = suspendAgentGlow();
  const onToolTarget = (event: Event): void => {
    const { element } = (event as CustomEvent).detail ?? {};

    highlight(visualizer, element);
  };
  const onToolCall = (event: Event): void => {
    const { tool, phase, guard, approval, glowTarget } = (event as CustomEvent).detail ?? {};

    // A confirm-guarded call only proposes: nothing ran, nothing to point at.
    if (guard === 'confirm' && !approval) return;
    if (phase === 'start') highlight(visualizer, tool ? glowTargetFor(tool) : undefined);
    else if (phase === 'ok') highlight(visualizer, glowTarget);
  };

  mountSteps(visualizer.element, options.container);
  document.addEventListener('janux:tool-target', onToolTarget);
  document.addEventListener('janux:tool-call', onToolCall);

  return {
    visualizer,
    dispose() {
      document.removeEventListener('janux:tool-target', onToolTarget);
      document.removeEventListener('janux:tool-call', onToolCall);
      visualizer.element.remove();
      visualizer.dispose();
      resumeGlow();
    },
  };
}
