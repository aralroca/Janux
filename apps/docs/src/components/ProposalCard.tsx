interface ProposalCardProps {
  /** What the agent wants to run, tool name and input. */
  summary: string;
  /** The copilot's own `forbidden` intents — a human decides, never the agent. */
  onApprove: any;
  onReject: any;
}

/**
 * The approval card, as the chat shows it. A plain function rather than a
 * component: it owns no state and mounts no island — the copilot's own state
 * holds the pending proposal, and its `forbidden` intents settle it.
 */
export function ProposalCard({ summary, onApprove, onReject }: ProposalCardProps) {
  return (
    <div class="proposal-card" role="alert">
      <p class="proposal-title">⏸ Approval required</p>
      <p>
        The agent wants to run <code>{summary}</code>
      </p>
      <p class="proposal-why">guard: confirm — nothing happens until you decide.</p>
      <div class="proposal-actions">
        <button type="button" class="approve" onClick={onApprove}>
          Approve
        </button>
        <button type="button" class="reject" onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}
