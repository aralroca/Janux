/**
 * A `confirm`-guarded intent an agent calls does not run — it proposes, and a
 * human decides. The playground has always shown that card in its agent pane,
 * which is exactly where the copilot's own panel sits on top of it: the reader
 * was told to approve in a panel they could not see.
 *
 * This is the seam between the two islands. The chat registers itself as a
 * place approvals can happen; the playground registers how a decision is
 * carried out. Both surfaces funnel into `decideApproval`, so a proposal is
 * settled once no matter which card the reader used.
 */

export interface AgentProposal {
  id: string;
  tool: string;
  input?: unknown;
  diff?: { before: unknown; after: unknown };
}

export interface ApprovalSurface {
  /** Show the proposal. `false` when it can't right now — a closed panel shows nothing. */
  show(proposal: AgentProposal): boolean;
  /** Take the card down: decided somewhere else. */
  clear(id: string): void;
}

let surface: ApprovalSurface | undefined;
let sink: ((id: string, approved: boolean) => void) | undefined;
/*
 * Held, not just forwarded. A proposal can be raised before the chat can take
 * it — the panel is closed, or its island is still mounting — and a decision
 * the reader never sees is a turn parked forever. So the undecided proposal
 * stays here and is re-offered every time the surface changes or the panel
 * opens, instead of being lost to whichever happened first.
 */
let undecided: AgentProposal | undefined;
/**
 * Which island's surface is installed. An island can be torn down *after* its
 * replacement mounted, and an unguarded `detach` then unregisters the live
 * surface — leaving a proposal nobody can answer and a turn parked on it.
 */
let owner: unknown;

function offer(): void {
  if (undecided) surface?.show(undecided);
}

/** The chat, while its island is mounted. `owner` identifies the instance. */
export function useApprovalSurface(next: ApprovalSurface, instance: unknown): void {
  surface = next;
  owner = instance;
  offer();
}

/** Only the instance that installed it can take it away. */
export function releaseApprovalSurface(instance: unknown): void {
  if (owner !== instance) return;
  surface = undefined;
  owner = undefined;
}

/** The playground, which owns the wire to the frame holding the parked call. */
export function useApprovalSink(next: ((id: string, approved: boolean) => void) | undefined): void {
  sink = next;
}

/** Re-offers whatever is still undecided — the panel just became able to show it. */
export function offerPendingApproval(): void {
  offer();
}

/** A guarded call is parked on this proposal until a human answers. */
export function showApproval(proposal: AgentProposal): void {
  undecided = proposal;
  offer();
}

/** The reader decided — in the chat or in the agent pane. One path for both. */
export function decideApproval(id: string, approved: boolean): void {
  if (undecided?.id === id) undecided = undefined;
  surface?.clear(id);
  sink?.(id, approved);
}

/** The playground went away; nothing is left to decide. */
export function forgetApprovals(): void {
  if (undecided) surface?.clear(undecided.id);
  undecided = undefined;
}
