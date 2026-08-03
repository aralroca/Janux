/** Token/cost accounting, as the agent envelope reports it per turn. */
export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

function total(used: TurnUsage[], pick: (usage: TurnUsage) => number | undefined): number {
  return used.reduce((sum, usage) => sum + (pick(usage) ?? 0), 0);
}

/** Totals over whatever reported usage; `undefined` when nothing did, so report shapes stay additive. */
export function sumUsage(entries: (TurnUsage | undefined)[]): TurnUsage | undefined {
  const used = entries.filter((entry): entry is TurnUsage => entry !== undefined);
  const priced = used.some((usage) => usage.costUsd !== undefined);

  if (used.length === 0) return undefined;

  return {
    inputTokens: total(used, (usage) => usage.inputTokens),
    outputTokens: total(used, (usage) => usage.outputTokens),
    ...(priced && { costUsd: total(used, (usage) => usage.costUsd) }),
  };
}
