import type { ModelCost } from './tracing';
import type { TokenUsage } from './providers';

/** What one whole turn cost: every round's tokens, priced when the app declared a `cost`. */
export interface TurnBill {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

function total(used: TokenUsage[], pick: (usage: TokenUsage) => number | undefined): number {
  return used.reduce((sum, usage) => sum + (pick(usage) ?? 0), 0);
}

/**
 * The caller's one bill for the whole turn: the parent loop plus every
 * delegation, each already priced by its own model's cost. The price is the
 * sum of the priced parts — an unpriced subagent adds tokens, never dollars.
 */
export function combineBills(bills: (TurnBill | undefined)[]): TurnBill | undefined {
  const real = bills.filter((bill): bill is TurnBill => bill !== undefined);
  const priced = real.filter((bill) => bill.costUsd !== undefined);

  if (real.length === 0) return undefined;

  return {
    inputTokens: real.reduce((sum, bill) => sum + bill.inputTokens, 0),
    outputTokens: real.reduce((sum, bill) => sum + bill.outputTokens, 0),
    ...(priced.length > 0 && { costUsd: priced.reduce((sum, bill) => sum + bill.costUsd!, 0) }),
  };
}

/** Sums whatever the provider reported; `undefined` when no round reported usage. */
export function turnBill(rounds: (TokenUsage | undefined)[], cost?: ModelCost): TurnBill | undefined {
  const used = rounds.filter((usage): usage is TokenUsage => usage !== undefined);
  const inputTokens = total(used, (usage) => usage.inputTokens);
  const outputTokens = total(used, (usage) => usage.outputTokens);

  if (used.length === 0) return undefined;

  return {
    inputTokens,
    outputTokens,
    ...(cost && { costUsd: (inputTokens * cost.input + outputTokens * cost.output) / 1_000_000 }),
  };
}
