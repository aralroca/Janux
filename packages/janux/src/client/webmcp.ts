import type { Manifest, ManifestTool } from '../manifest';
import type { JanuxBridge } from './bridge';
import { createNavigateTool } from './navigate-tool';

export interface WebMCPToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: unknown) => unknown;
}

export interface ModelContext {
  registerTool(tool: WebMCPToolDescriptor, options?: { signal?: AbortSignal }): unknown;
  provideContext?(context: { tools: WebMCPToolDescriptor[] }): unknown;
}

export interface ModelContextPolyfill extends ModelContext {
  polyfilled: true;
  /** Polyfill-only: enumerate registered tools (the real API keeps them internal). */
  listTools(): WebMCPToolDescriptor[];
  /** Polyfill-only: invoke a registered tool by name, gui-agent style. */
  callTool(name: string, input?: unknown): Promise<unknown>;
}

export interface WebMCPHandle {
  /** Re-reads the manifest and re-registers every tool. Runs automatically on SPA navigation. */
  sync(): Promise<void>;
  dispose(): void;
}

/**
 * Spec-shaped stand-in for `document.modelContext` (WebMCP). Lets the same
 * registration path — and any in-page agent or test — work in browsers that
 * don't ship the API yet. Registrations honor AbortSignal like the real thing.
 */
export function createModelContextPolyfill(): ModelContextPolyfill {
  const tools = new Map<string, WebMCPToolDescriptor>();

  const registerTool = (tool: WebMCPToolDescriptor, options?: { signal?: AbortSignal }): void => {
    if (options?.signal?.aborted) return;
    tools.set(tool.name, tool);
    options?.signal?.addEventListener('abort', () => {
      if (tools.get(tool.name) === tool) tools.delete(tool.name);
    });
  };

  return {
    polyfilled: true,
    registerTool,
    provideContext({ tools: next }) {
      tools.clear();
      next.forEach((tool) => registerTool(tool));
    },
    listTools: () => [...tools.values()],
    async callTool(name, input) {
      const tool = tools.get(name);

      if (!tool) throw new Error(`WebMCP polyfill: unknown tool "${name}"`);

      return tool.execute(input);
    },
  };
}

/** The native context when the browser has one (Chrome 149+ behind a flag); the polyfill otherwise. */
function resolveModelContext(): ModelContext {
  const doc = document as any;
  const native = doc.modelContext ?? (navigator as any).modelContext;

  if (native) return native;

  return (doc.modelContext = createModelContextPolyfill());
}

/**
 * The server knows the whole route (lazy islands, api() tools); unreachable →
 * empty, fail-soft. A static export omits the shell's manifest link precisely
 * because `/_janux/*` isn't there, so absence of the link means: don't ask.
 */
async function routeTools(): Promise<ManifestTool[]> {
  if (!document.getElementById('jx-manifest')) return [];
  try {
    const url = `/_janux/manifest?path=${encodeURIComponent(location.pathname)}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });

    if (!response.ok) return [];

    return ((await response.json()) as Manifest).tools ?? [];
  } catch {
    return [];
  }
}

async function callServerTool(name: string, input: unknown): Promise<unknown> {
  const response = await fetch(`/_janux/api/${name.slice('api.'.length)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-janux-origin': 'agent' },
    body: JSON.stringify(input ?? {}),
  });

  return response.json();
}

function descriptorFor(tool: ManifestTool, bridge: JanuxBridge): WebMCPToolDescriptor {
  const approval = tool.guard === 'confirm' ? ' Returns a proposal a human must approve.' : '';

  return {
    name: tool.name.replace(/[^\w-]/g, '_'),
    description: `${tool.description ?? `Janux tool ${tool.name}`}${approval}`,
    inputSchema: tool.input ?? { type: 'object', properties: {} },
    async execute(input) {
      const result = tool.name.startsWith('api.')
        ? await callServerTool(tool.name, input)
        : await bridge.call(tool.name, input);

      return { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] };
    },
  };
}

/** Route manifest first, live local manifest on top (its `ready` state is current). */
function mergedTools(bridge: JanuxBridge, remote: ManifestTool[]): ManifestTool[] {
  const byName = new Map(remote.map((tool) => [tool.name, tool]));

  bridge.manifest().tools.forEach((tool) => byName.set(tool.name, tool));

  return [...byName.values()];
}

/**
 * Every tool this route exposes, whether or not its island has resumed yet.
 * The live bridge only knows what is mounted, and an agent asking "switch the
 * theme" must not depend on whether the visitor happened to click the toggle
 * first — `call()` mounts the island on demand anyway.
 *
 * Deliberately not cached: the route manifest is built per request against the
 * caller's `ctx`, so a dynamic guard can open or close a tool without any
 * navigation. It costs one small local request per call, which is noise next to
 * the model turn that follows it.
 */
export async function appTools(bridge: JanuxBridge): Promise<ManifestTool[]> {
  return mergedTools(bridge, await routeTools());
}

/**
 * Zero-config WebMCP: registers every mounted tool with `document.modelContext`
 * (polyfilled when absent) and keeps the registration in sync across SPA
 * navigations. Chrome's DevTools WebMCP panel then shows the Janux surface as-is.
 */
export function installWebMCP(bridge: JanuxBridge): WebMCPHandle {
  const context = resolveModelContext();
  let controller: AbortController | undefined;
  let chain: Promise<void> = Promise.resolve();

  const run = async (): Promise<void> => {
    const tools = await appTools(bridge);
    // An app tool named `navigate` owns the name; the built-in steps aside.
    const taken = tools.some((tool) => tool.name.replace(/[^\w-]/g, '_') === 'navigate');
    const descriptors = [...(taken ? [] : [createNavigateTool()]), ...tools.map((tool) => descriptorFor(tool, bridge))];

    controller?.abort();
    controller = new AbortController();
    for (const descriptor of descriptors) {
      try {
        await context.registerTool(descriptor, { signal: controller.signal });
      } catch {
        // One rejected registration (schema quirks, duplicate names…) must not drop the rest.
      }
    }
  };

  // Serialized like navigations: a re-sync never races the previous one's aborts.
  const sync = (): Promise<void> => (chain = chain.then(run));

  const onNavigate = (event: Event): void => {
    if ((event as CustomEvent).detail?.phase === 'after') void sync();
  };

  document.addEventListener('janux:navigate', onNavigate);
  void sync();

  return {
    sync,
    dispose() {
      document.removeEventListener('janux:navigate', onNavigate);
      void chain.then(() => controller?.abort());
    },
  };
}
