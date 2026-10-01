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
import type { AgentStep } from '@aralroca/gui-agent';
import { glowTargetFor, suspendAgentGlow, KEEP_ATTRIBUTE } from 'janux/client';

/** Marks the chip-list host, so apps position and theme it from their own CSS. */
export const STEPS_ATTRIBUTE = 'data-janux-agent-steps';

/** gui-agent's ring host, created lazily on its first highlight. */
const RING_SELECTOR = '[data-gui-agent-highlight]';
/** gui-agent's pointer host (`cursor: true`), created lazily on its first move. */
const CURSOR_SELECTOR = '[data-gui-agent-cursor]';
/** Long enough for the frame on which a selector target mounts its host. */
const FRAME_MS = 32;
/** ~2s of frames: as long as gui-agent waits for a selector target to mount. */
const CLAIM_TRIES = 64;

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
  /** Feeds an agent step to the visualizer, claiming the hosts it creates. */
  onStep(step: AgentStep): void;
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
  /** The `<body>` hosts gui-agent creates lazily for this config: the ring, and the pointer with `cursor`. */
  const hosts = [
    { selector: RING_SELECTOR, id: 'janux-agent-ring', wanted: config.highlight !== false },
    { selector: CURSOR_SELECTOR, id: 'janux-agent-cursor', wanted: Boolean(config.cursor) },
  ].filter((host) => host.wanted);
  let retry: ReturnType<typeof setTimeout> | undefined;
  /**
   * Claims those hosts: unmarked, a navigation's document diff takes them down
   * for good and the glow (or the pointer, animating a detached element) stops
   * working. A selector target mounts them a few frames later, hence the retry,
   * bounded by how long gui-agent itself waits for the target.
   */
  const claimHosts = (tries = CLAIM_TRIES): void => {
    const missing = hosts.filter(({ selector, id }) => {
      const host = document.querySelector(selector);

      if (host) markRuntimeHost(host, id);

      return !host;
    });

    clearTimeout(retry);
    if (missing.length && tries > 0) retry = setTimeout(() => claimHosts(tries - 1), FRAME_MS);
  };
  const highlight = (target: Element | string | undefined): void => {
    if (!target) return;
    visualizer.highlight(target);
    claimHosts();
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
    onStep(step) {
      visualizer.onStep(step);
      if (step.type === 'tool-target') claimHosts();
    },
    dispose() {
      clearTimeout(retry);
      document.removeEventListener('janux:tool-target', onToolTarget);
      document.removeEventListener('janux:tool-call', onToolCall);
      visualizer.element.remove();
      visualizer.dispose();
      resumeGlow();
    },
  };
}
