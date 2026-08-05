import { defineAgent, type AgentConfig } from '@janux/agent';

/**
 * One agent, two doors.
 *
 * Nothing here mentions a channel. The browser copilot and the webhook run this
 * same config through the same loop and the same invocation pipeline; what
 * changes is only what the surface can carry — in a browser the agent can
 * `focus` an incident on the board, on a webhook it cannot, and it is told so
 * by name rather than discovering it when a call goes nowhere.
 */
export const onCallDesk: AgentConfig = {
  instructions:
    'You are the on-call desk of a small operations app. ' +
    'Read the board before answering, keep replies to a sentence or two, and name incidents by their id. ' +
    'Paging an engineer wakes somebody up: propose it, never assume it.',
};

export default defineAgent(onCallDesk);
