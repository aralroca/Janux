import { defineTool } from '@aralroca/gui-agent';

/**
 * The preview runs in a sandboxed frame, so the example's intents live in *that*
 * document's manifest — and the copilot, which syncs tools from this one, could
 * not see them. Asked to "add +1" it had nothing to call, so it narrated instead.
 *
 * These bridge every frame tool into this page's tool registry (and, through
 * `defineTool`, onto `document.modelContext`), so anything driving the page —
 * Ask AI, a DevTools WebMCP panel — operates the playground the way an agent
 * operates a real Janux app: same call, same guards, same feedback.
 *
 * Imported from gui-agent rather than `@janux/agent/local` on purpose: the
 * playground must not drag the whole copilot runtime into its chunk.
 */

/** A frame that never answers must not hang the model's turn. */
const CALL_TIMEOUT_MS = 10_000;

type Send = (message: Record<string, unknown>) => void;

export interface FrameTools {
  /** Re-registers the tools when the example changes, and keeps the latest state snapshot. */
  sync(manifest: any, resource: any): void;
  /** Hands the frame's answer back to the waiting caller. */
  settle(id: string, result: unknown): void;
  dispose(): void;
}

/** `counter.inc` → `playground_counter_inc`: models are steadier with snake_case. */
function wireName(name: string): string {
  return `playground_${name}`.replace(/[^\w-]/g, '_');
}

function describe(tool: any): string {
  const approval =
    tool.guard === 'confirm' ? ' Returns a proposal the reader must approve in the panel before it runs.' : '';

  return `Playground preview — ${tool.description ?? tool.name}.${approval}`;
}

export function createFrameTools(send: Send): FrameTools {
  const pending = new Map<string, (payload: unknown) => void>();
  /*
   * One signal per tool surface. `defineTool`'s dispose unregisters the tool
   * from gui-agent's registry but leaves its `document.modelContext` mirror
   * behind — only an abort revokes both. Without it, loading a second example
   * left the first one's tools on the page's WebMCP surface, pointing at intents
   * the frame no longer has.
   */
  let surface: AbortController | undefined;
  let snapshot: any;
  let signature: string | undefined;
  let seq = 0;
  const finish = (id: string, payload: unknown): void => {
    const resolve = pending.get(id);

    if (!resolve) return;
    pending.delete(id);
    resolve(payload);
  };
  const call = (tool: string, input: unknown): Promise<unknown> => {
    const id = `copilot-${(seq += 1)}`;
    const answer = new Promise<unknown>((resolve) => pending.set(id, resolve));
    const expiry = setTimeout(() => finish(id, { error: `The preview did not answer "${tool}" in time.` }), CALL_TIMEOUT_MS);

    send({ type: 'call', tool, input, id });

    return answer.finally(() => clearTimeout(expiry));
  };
  const register = (tool: any, signal: AbortSignal): void => {
    defineTool(
      {
        name: wireName(tool.name),
        description: describe(tool),
        inputSchema: tool.input ?? { type: 'object', properties: {} },
        execute: (input) => call(tool.name, input),
      },
      { replace: true, signal },
    );
  };
  const revoke = (): void => {
    surface?.abort();
    surface = undefined;
  };
  const replaceSurface = (tools: any[]): void => {
    revoke();
    surface = new AbortController();
    tools.forEach((tool) => register(tool, surface!.signal));
  };

  return {
    sync(manifest, resource) {
      const tools = manifest?.tools ?? [];
      // The whole shape, not just the names: editing an intent's input schema
      // renames nothing, and a stale schema is what the model would be handed.
      const shape = JSON.stringify(tools.map((tool: any) => [tool.name, tool.guard, tool.input]));

      // Every call reports fresh state; only a changed surface needs re-registering.
      snapshot = resource;
      if (shape === signature) return;
      signature = shape;
      replaceSurface(tools);
    },
    // The frame reports its new state before it answers, so the caller reads the
    // result *and* what the page now looks like — one round trip, not two.
    settle(id, result) {
      finish(id, { result, state: snapshot?.state, derived: snapshot?.derived });
    },
    dispose() {
      revoke();
      // Navigating away mid-call must fail the turn, not hang it: an unsettled
      // tool promise leaves the model waiting on a frame that no longer exists.
      pending.forEach((resolve) => resolve({ error: 'The playground preview went away.' }));
      pending.clear();
      signature = undefined;
    },
  };
}
