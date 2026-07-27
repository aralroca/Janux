import { GuiAgent, registry } from '@aralroca/gui-agent';
import type { AgentStep, Confirm, Llm, RunResult, ToolDefinition } from '@aralroca/gui-agent';
import type { AgentVisualizer, AgentVisualizerOptions } from '@aralroca/gui-agent/ui';
import { appTools, createNavigateTool } from 'janux/client';
import { allowsTool, type ToolFilter } from '../tool-filter';
import type { UIMessageChunk } from './llm';
import { runStream } from './stream';
import { startVisualization, type Visualization } from './visualize';

export interface CopilotOptions {
  /** The model driving the loop: `localLlm()`, `serverLlm()`, or any custom {@link Llm}. */
  llm: Llm;
  /** Extra system prompt appended to gui-agent's built-in instructions. */
  instructions?: string;
  /** Maximum tool-calling rounds per question. Default 8. */
  maxSteps?: number;
  /** Confirmation gate for non-read-only tool calls. */
  confirm?: Confirm;
  /** Observe each step of the loop. */
  onStep?: (step: AgentStep) => void;
  /** Expose the Janux manifest tools (intents + api()) to the model. Default true. */
  manifestTools?: boolean;
  /**
   * Which manifest tools reach the model, same patterns as `defineAgent({ tools })`:
   * `include` is an allowlist (default: everything), `exclude` always wins. Use it
   * to hide server tools a client-side `defineTool` already covers, or to keep the
   * copilot from calling its own intents.
   */
  tools?: ToolFilter;
  /** Synthesize generic click/fill/read tools from the live DOM. Default false. */
  domFallback?: boolean;
  /**
   * Show what the agent is doing: a status chip per tool call, an animated glow
   * ring around the element being operated and a backdrop veil over the rest of
   * the page. `true` or gui-agent's `AgentVisualizerOptions`. The chip host is
   * appended to `<body>` marked `data-janux-agent-steps` — position it from your
   * CSS, or pass `container` to place it yourself. While it runs, the built-in
   * `boot({ glow })` highlight stands down.
   */
  visualize?: boolean | AgentVisualizerOptions;
}

export interface Copilot {
  /** Run the agent loop toward `question`; resolves with the final answer and transcript. */
  ask(question: string, signal?: AbortSignal): Promise<RunResult>;
  /**
   * The same run, as an [AI SDK UI Message Stream](/docs/reference/agent-api)
   * of chunks: text deltas and tool inputs as the model produces them, tool
   * outputs as the page executes them. Needs a streaming `llm` for the text to
   * arrive live (`serverLlm({ stream: true })`).
   */
  stream(question: string, signal?: AbortSignal): ReadableStream<UIMessageChunk>;
  /** The visualizer driving the chips and the glow — present once a run has started it. */
  visualizer?: AgentVisualizer;
  /** Unregister the manifest tools this copilot bridged into gui-agent. */
  dispose(): void;
}

/** Models are steadier with `snake_case` names; mirrors installWebMCP's sanitization. */
const wireName = (name: string): string => name.replace(/[^\w-]/g, '_');

async function callServerTool(name: string, input: unknown): Promise<unknown> {
  const response = await fetch(`/_janux/api/${name.slice('api.'.length)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-janux-origin': 'agent' },
    body: JSON.stringify(input ?? {}),
  });

  return response.json();
}

function toDefinition(tool: any, bridge: any): ToolDefinition {
  const approval = tool.guard === 'confirm' ? ' Returns a proposal a human must approve.' : '';

  return {
    name: wireName(tool.name),
    description: `${tool.description ?? `Janux tool ${tool.name}`}${approval}`,
    inputSchema: tool.input ?? { type: 'object', properties: {} },
    execute: (input) =>
      tool.name.startsWith('api.') ? callServerTool(tool.name, input) : bridge.call(tool.name, input),
  };
}

/** Re-registers every manifest tool (replace-mode: SPA navigations change the surface). */
async function syncManifestTools(registered: Set<string>, filter: ToolFilter | undefined): Promise<void> {
  const bridge = (window as any).janux;

  if (!bridge) return;
  // The route's whole surface, not just the islands that happen to be mounted:
  // "switch the theme" must not depend on the visitor having clicked the toggle.
  const tools = await appTools(bridge);

  tools.forEach((tool: any) => {
    const name = wireName(tool.name);

    // Filtered on the manifest name, the one the app wrote — not on the wire name.
    if (!allowsTool(tool.name, filter)) return;

    // A same-named tool registered by the app itself (defineTool) wins.
    if (registry.has(name) && !registered.has(name)) return;
    registry.register(toDefinition(tool, bridge), { replace: true, skipModelContext: true });
    registered.add(name);
  });
}

/** Mirrors the framework's built-in navigate tool into the gui-agent registry. */
function syncNavigateTool(registered: Set<string>): void {
  const tool = createNavigateTool();

  if (registry.has(tool.name) && !registered.has(tool.name)) return;
  registry.register(
    {
      name: tool.name,
      description: tool.description ?? tool.name,
      inputSchema: tool.inputSchema,
      execute: (input) => tool.execute(input),
    },
    { replace: true, skipModelContext: true },
  );
  registered.add(tool.name);
}

/**
 * A browser-side copilot for a Janux app: the gui-agent loop over the app's
 * own tools (manifest intents + api() endpoints, plus anything registered with
 * `defineTool`), driven by a local or server {@link Llm}.
 */
export function createCopilot(options: CopilotOptions): Copilot {
  const registered = new Set<string>();
  const runListeners = new Set<(step: AgentStep) => void>();
  let visualization: Visualization | undefined;
  // The visualizer never replaces the caller's observer — it chains onto it.
  const onStep = (step: AgentStep): void => {
    options.onStep?.(step);
    visualization?.visualizer.onStep(step);
    runListeners.forEach((listener) => listener(step));
  };
  /**
   * Built on the first run, not at construction: an app that wires its copilot
   * up front but never asks anything would otherwise pay for the overlay and,
   * worse, hold the built-in glow suspended for the whole session. Each run
   * starts from a clean chip list.
   */
  const startRun = (): void => {
    if (!options.visualize) return;
    visualization ??= startVisualization(options.visualize, wireName);
    visualization.visualizer.clear();
  };

  const ask = async (question: string, signal?: AbortSignal): Promise<RunResult> => {
    startRun();
    if (options.manifestTools !== false) await syncManifestTools(registered, options.tools);
    syncNavigateTool(registered);
    const agent = new GuiAgent({
      llm: options.llm,
      systemPrompt: options.instructions,
      maxSteps: options.maxSteps ?? 8,
      domFallback: options.domFallback ?? false,
      confirm: options.confirm,
      onStep,
    });

    return agent.run(question, signal);
  };

  return {
    get visualizer() {
      return visualization?.visualizer;
    },
    ask,
    stream(question, signal) {
      return runStream({
        llm: options.llm,
        signal,
        run: () => ask(question, signal),
        listen: (listener) => {
          runListeners.add(listener);

          return () => runListeners.delete(listener);
        },
      });
    },
    dispose() {
      registered.forEach((name) => registry.unregister(name));
      registered.clear();
      visualization?.dispose();
      // Cleared, not just disposed: `ask()` re-registers the tools it removed,
      // so a run after this one must build a live overlay, not reuse a dead one.
      visualization = undefined;
    },
  };
}
