import { defineTool } from '@aralroca/gui-agent';
import { showApproval, type AgentProposal } from '../approvals';

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
/** A reader who never decides must not hang it either — just far more patiently. */
const APPROVAL_TIMEOUT_MS = 120_000;
/** Long enough for the frame's post-approval state report, short enough not to stall the answer. */
const REPORT_TIMEOUT_MS = 1_000;

type Send = (message: Record<string, unknown>) => void;

export interface FrameTools {
  /** Re-registers the tools when the example changes, and keeps the latest state snapshot. */
  sync(manifest: any, resource: any): void;
  /** Hands the frame's answer back to the waiting caller. */
  settle(id: string, result: unknown): void;
  /** A parked proposal was approved or rejected; the call it blocked can answer. */
  decided(proposalId: string, approved: boolean): Promise<void>;
  dispose(): void;
}

function proposalOf(result: any): AgentProposal | undefined {
  return result?.status === 'proposal' ? result : undefined;
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
  const expiries = new Map<string, ReturnType<typeof setTimeout>>();
  /** Proposal id → the call parked on it, waiting for a human. */
  const parked = new Map<string, string>();
  const reports: (() => void)[] = [];
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
    clearTimeout(expiries.get(id));
    expiries.delete(id);
    pending.delete(id);
    resolve(payload);
  };
  const expire = (id: string, ms: number, payload: unknown): void => {
    clearTimeout(expiries.get(id));
    expiries.set(id, setTimeout(() => finish(id, payload), ms));
  };
  const call = (tool: string, input: unknown): Promise<unknown> => {
    const id = `copilot-${(seq += 1)}`;
    const answer = new Promise<unknown>((resolve) => pending.set(id, resolve));

    expire(id, CALL_TIMEOUT_MS, { error: `The preview did not answer "${tool}" in time.` });
    send({ type: 'call', tool, input, id });

    return answer;
  };
  /** The frame reports state after it runs a proposal; the answer waits for that report. */
  const nextReport = (): Promise<void> =>
    new Promise((resolve) => {
      reports.push(resolve);
      setTimeout(resolve, REPORT_TIMEOUT_MS);
    });
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
      /*
       * The whole manifest, verbatim — not a list of fields worth watching.
       * Picking fields is how the agent pane came to advertise one description
       * while the registered tool still carried the previous one: the reader
       * edits arbitrary parts of an intent, so anything that differs is a
       * different surface, including fields nobody has added yet.
       */
      const shape = JSON.stringify(tools);

      // Every call reports fresh state; only a changed surface re-registers.
      snapshot = resource;
      reports.splice(0).forEach((done) => done());
      if (shape === signature) return;
      signature = shape;
      replaceSurface(tools);
    },
    /*
     * The frame reports its new state before it answers, so the caller reads the
     * result *and* what the page now looks like — one round trip, not two.
     *
     * A guarded intent is the exception: it proposed rather than ran, so the
     * call parks until a human decides. Answering "it needs approval" and
     * moving on is what left the model telling the reader to use a panel the
     * chat was covering.
     */
    settle(id, result) {
      const proposal = proposalOf(result);

      if (!proposal) return finish(id, { result, state: snapshot?.state, derived: snapshot?.derived });
      parked.set(proposal.id, id);
      expire(id, APPROVAL_TIMEOUT_MS, { approved: false, note: 'The reader did not answer the approval request.' });
      showApproval(proposal);
    },
    async decided(proposalId, approved) {
      const id = parked.get(proposalId);

      if (id === undefined) return;
      parked.delete(proposalId);
      if (approved) await nextReport();
      finish(
        id,
        approved
          ? { approved: true, state: snapshot?.state, derived: snapshot?.derived }
          : { approved: false, note: 'The reader rejected the proposal; nothing ran.' },
      );
    },
    dispose() {
      revoke();
      // Navigating away mid-call must fail the turn, not hang it: an unsettled
      // tool promise leaves the model waiting on a frame that no longer exists.
      // Parked approvals included — nobody is left to decide them.
      pending.forEach((resolve) => resolve({ error: 'The playground preview went away.' }));
      expiries.forEach((timer) => clearTimeout(timer));
      [pending, expiries, parked].forEach((map) => map.clear());
      reports.length = 0;
      signature = undefined;
    },
  };
}
