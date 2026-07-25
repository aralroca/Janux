/**
 * The copilot's visualization layer: gui-agent's visualizer (status chips per
 * tool call, an animated gradient ring around the element being operated, a
 * backdrop veil that blurs the rest of the page) driven by the runtime's two
 * feedback events — `janux:tool-call` for the app's own intents and
 * `janux:tool-target` for the framework's `ui_click`/`ui_fill`. gui-agent's own
 * DOM tools (`domFallback`) report through the step stream instead, which the
 * visualizer already consumes.
 *
 * It lives in the framework rather than in each app because every Janux app has
 * the same two events to visualize, and getting the overlay to survive island
 * re-renders and navigations is runtime knowledge.
 */
import { createAgentVisualizer, type AgentVisualizer, type AgentVisualizerOptions } from '@aralroca/gui-agent/ui';
import { glowTargetFor, suspendAgentGlow, KEEP_ATTRIBUTE } from 'janux/client';

/** Marks the chip-list host, so apps position and theme it from their own CSS. */
export const STEPS_ATTRIBUTE = 'data-janux-agent-steps';

/** gui-agent's ring host, created lazily on its first highlight. */
const RING_SELECTOR = '[data-gui-agent-highlight]';
/** Long enough for the frame on which a selector target mounts its host. */
const FRAME_MS = 32;

/**
 * Marks a host the runtime injected so a navigation keeps it. The id matters as
 * much as the attribute: the document diff keys live children by `key`/`id`, and
 * an anonymous `<div>` at the same position as an incoming one is patched in
 * place — the host would survive stripped of its markers instead of being
 * removed and restored.
 */
function markRuntimeHost(host: Element, id: string): void {
  if (!host.id) host.id = id;
  host.setAttribute(KEEP_ATTRIBUTE, '');
}

export interface Visualization {
  visualizer: AgentVisualizer;
  dispose(): void;
}

/** Apps label tools as `component.intent`; the model sees them sanitized. */
function wireLabels(
  labels: AgentVisualizerOptions['labels'],
  wireName: (name: string) => string,
): AgentVisualizerOptions['labels'] {
  if (!labels) return undefined;

  return Object.fromEntries(Object.entries(labels).map(([name, label]) => [wireName(name), label]));
}

/** Places the chip host outside every island, where no re-render owns it. */
function mountSteps(host: HTMLElement, container: Element | undefined): void {
  host.setAttribute(STEPS_ATTRIBUTE, '');
  markRuntimeHost(host, 'janux-agent-steps');
  if (!container) document.body.appendChild(host);
}

export function startVisualization(
  options: true | AgentVisualizerOptions,
  wireName: (name: string) => string,
): Visualization {
  const config = options === true ? {} : options;
  const visualizer = createAgentVisualizer({ ...config, labels: wireLabels(config.labels, wireName) });
  const resumeGlow = suspendAgentGlow();
  let ring: Element | null = null;
  /**
   * Claims the host gui-agent lazily creates for the ring: it lives in `<body>`,
   * so without the marker a navigation's document diff takes it down for good
   * and the glow silently stops working. A selector target mounts the host a
   * frame later, hence the retry.
   */
  const claimRing = (): void => {
    if (ring?.isConnected) return;
    ring = document.querySelector(RING_SELECTOR);
    if (ring) markRuntimeHost(ring, 'janux-agent-ring');
    else setTimeout(claimRing, FRAME_MS);
  };
  const highlight = (target: Element | string | undefined): void => {
    if (!target) return;
    visualizer.highlight(target);
    claimRing();
  };
  const onToolTarget = (event: Event): void => {
    highlight((event as CustomEvent).detail?.element);
  };
  const onToolCall = (event: Event): void => {
    const { tool, input, phase, guard, approval, glowTarget, glowTargetPending } = (event as CustomEvent).detail ?? {};

    // A confirm-guarded call only proposes: nothing ran, nothing to point at.
    if (guard === 'confirm' && !approval) return;
    if (phase === 'ok') return highlight(glowTarget);
    // Guessing from the view would ring the island first and the intent's real
    // target a moment later — two rings for one action.
    if (phase === 'start' && !glowTargetPending) highlight(tool ? glowTargetFor(tool, input) : undefined);
  };

  mountSteps(visualizer.element, config.container);
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
