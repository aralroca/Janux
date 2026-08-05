import { defineAgent, type AgentConfig } from '@janux/agent';

/**
 * A support desk composed of three agents on one app:
 * - the front desk (this config) answers product questions and routes;
 * - `research` is a SUBAGENT — the front desk hands it a focused task via
 *   `delegate.research`, it works server-side on `api.support.*` under a
 *   mandatory budget, and reports back;
 * - `billing` is a HANDOFF target — money questions transfer the whole
 *   conversation via `handoff.billing`, and it answers the user from then on.
 *
 * The front desk excludes `api.admin.*`, and the intersection rule means no
 * subagent can reach it either — a delegate narrows the surface, never widens it.
 */
export const supportDesk: AgentConfig = {
  instructions:
    'You are the front desk of the Janux support demo. ' +
    'Answer product questions yourself; for anything that needs looking up, delegate to the research subagent. ' +
    'Money questions — refunds, invoices — belong to the billing agent: hand the conversation off.',
  tools: { exclude: ['api.admin.*'] },
  subagents: {
    research: {
      description: 'Looks facts up in the product knowledge base and reports back.',
      instructions:
        'You are the research subagent. Answer strictly from api.support.search results, citing entry ids. Reply with the answer only.',
      tools: { include: ['api.support.*'] },
      budget: { maxTurns: 4, maxTokens: 30_000, maxMs: 30_000 },
    },
  },
  handoffs: {
    billing: {
      description: 'Handles refunds, invoices and anything involving money.',
      instructions:
        'You are the billing specialist. Resolve refunds and invoices with the api.billing tools, and be precise about amounts.',
      tools: { include: ['api.billing.*'] },
    },
  },
};

export default defineAgent(supportDesk);
