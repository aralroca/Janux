import { GuiAgent, registry } from '@aralroca/gui-agent';
import type { AgentStep, Confirm, Llm, RunResult, ToolDefinition } from '@aralroca/gui-agent';
import { createNavigateTool } from 'janux/client';

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
  /** Synthesize generic click/fill/read tools from the live DOM. Default false. */
  domFallback?: boolean;
}

export interface Copilot {
  /** Run the agent loop toward `question`; resolves with the final answer and transcript. */
  ask(question: string, signal?: AbortSignal): Promise<RunResult>;
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
function syncManifestTools(registered: Set<string>): void {
  const bridge = (window as any).janux;

  if (!bridge) return;
  bridge.manifest().tools.forEach((tool: any) => {
    const name = wireName(tool.name);

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

  return {
    ask(question, signal) {
      if (options.manifestTools !== false) syncManifestTools(registered);
      syncNavigateTool(registered);
      const agent = new GuiAgent({
        llm: options.llm,
        systemPrompt: options.instructions,
        maxSteps: options.maxSteps ?? 8,
        domFallback: options.domFallback ?? false,
        confirm: options.confirm,
        onStep: options.onStep,
      });

      return agent.run(question, signal);
    },
    dispose() {
      registered.forEach((name) => registry.unregister(name));
      registered.clear();
    },
  };
}
