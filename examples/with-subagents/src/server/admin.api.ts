import { api } from '@janux/server';

/**
 * The surface the copilot must never reach: `defineAgent({ tools })` excludes
 * `api.admin.*`, and the intersection rule keeps it off every subagent too —
 * the e2e suite proves a delegate cannot call this even when its model tries.
 */
export const purge = api({
  description: 'Wipe the demo ledger. Operators only — excluded from the copilot and its subagents.',
  run: () => ({ purged: true }),
});
