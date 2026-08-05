import type { ProposalOutcome } from './proposals';

/**
 * Elicitation (2026-07-28), mapped onto the proposals Janux already parks.
 *
 * The spec asks the server to answer `input_required` and let the client retry
 * the same call once it has gathered what was asked for (multi round-trip —
 * SEP-1036/MRTR). That is the same shape `guard: 'confirm'` has always had
 * here: the call parks, a human settles it elsewhere, and whoever proposed it
 * comes back for the outcome. So nothing about the guard moves — this file only
 * says on the wire what the vault was already doing.
 *
 * `url` mode on purpose, never `form`: the human approves in Janux's own page,
 * where the proposal's tool and input are shown and where the approval lands in
 * the audit trail as `origin: 'human'`. Form mode would have the MCP client
 * collect the answer instead, which is the one place this decision must not be
 * made. A client that cannot do `url` is not elicited from at all.
 */

const META = 'io.modelcontextprotocol/';
/** One key is enough: a confirm guard asks exactly one question. */
const REQUEST_KEY = 'approval';

export interface ElicitationVault {
  pending(token: string): { tool: string; input: unknown } | undefined;
  outcome(token: string): ProposalOutcome | undefined;
  reject(token: string): void;
}

/** What the proposal path handed back, before it is projected onto either era. */
export interface ParkedProposal {
  status: 'proposal';
  id: string;
  tool: string;
  input: unknown;
}

export function isParkedProposal(result: unknown): result is ParkedProposal {
  return (result as ParkedProposal | undefined)?.status === 'proposal';
}

/**
 * Whether this client can be sent to a URL. An absent or empty `elicitation`
 * capability means form mode only (the spec's backwards-compatible reading), and
 * a server MUST NOT send a mode the client did not claim.
 */
export function elicitsByUrl(params: unknown): boolean {
  const capabilities = (params as any)?._meta?.[`${META}clientCapabilities`];

  return capabilities?.elicitation?.url !== undefined;
}

/**
 * The `input_required` answer: where to send the human, and the state to come
 * back with. Built the same way for the first attempt and for a retry that
 * arrived before the human did — the question has not changed, so neither has
 * the answer.
 */
export function inputRequired(token: string, tool: string, origin: string): Record<string, unknown> {
  const url = `${origin}/_janux/elicit?token=${encodeURIComponent(token)}`;

  return {
    resultType: 'input_required',
    inputRequests: {
      [REQUEST_KEY]: {
        method: 'elicitation/create',
        params: {
          mode: 'url',
          message: `"${tool}" is guarded by guard: 'confirm'. Nothing has run. Open this page to approve or reject it.`,
          url,
        },
      },
    },
    requestState: token,
  };
}

/** What the client says the user did with the page it was sent to. */
function actionOf(params: unknown): string | undefined {
  return (params as any)?.inputResponses?.[REQUEST_KEY]?.action;
}

export type Retry =
  | { kind: 'result'; result: unknown }
  | { kind: 'refused'; reason: string }
  | { kind: 'waiting'; state: string };

/**
 * A retry carrying `requestState`, resolved against the vault. The state is
 * attacker-controlled, so it buys nothing on its own: it is the proposal token,
 * and the vault verifies its signature before answering anything about it.
 */
export function resolveRetry(params: unknown, vault: ElicitationVault): Retry | undefined {
  const state = (params as { requestState?: unknown })?.requestState;
  const action = actionOf(params);

  if (typeof state !== 'string' || state === '') return undefined;
  if (action === 'decline' || action === 'cancel') {
    vault.reject(state);

    return { kind: 'refused', reason: 'the user declined the elicitation' };
  }

  return outcomeOf(state, vault);
}

function outcomeOf(state: string, vault: ElicitationVault): Retry {
  const outcome = vault.outcome(state);

  if (outcome?.ok) return { kind: 'result', result: outcome.result };
  if (outcome) return { kind: 'refused', reason: 'a human rejected the proposal' };
  if (vault.pending(state)) return { kind: 'waiting', state };

  return { kind: 'refused', reason: 'unknown or expired proposal' };
}
