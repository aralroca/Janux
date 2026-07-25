/**
 * The copilot: the agent loop over this app's own tools, with the interaction
 * visualizer on. `visualize` is all it takes — the framework feeds it from
 * `janux:tool-call` (intents, plus the `glowTarget` the workflow declares) and
 * `janux:tool-target` (the DOM fallback), and stands the built-in glow down.
 *
 * The brain is a scripted planner so the demo needs no API key. For a real one:
 * `llm: supportsLocalLlm() ? localLlm() : serverLlm()`.
 */
import { createCopilot, type Copilot, type Llm, type LlmRequest, type LlmResponse } from '@janux/agent/local';
import { PENDING_REF, planFor } from './demo-plan';

/** A real model takes a moment; the pause is what makes "Thinking…" visible. */
const THINKING_MS = 350;
const REF = /\[(e\d+)\]/;
const NO_MATCH =
  "I couldn't map that to an action. Try 'invite jane@acme.com as admin', 'search Kenji', " +
  "'change my display name to Neo' or 'build a workflow'.";

let copilot: Copilot | undefined;

/** The goal is the first user message; the turn is how many tool rounds ran. */
function turnOf(messages: LlmRequest['messages']): number {
  return messages.filter((message) => message.role === 'assistant' && message.toolCalls?.length).length;
}

/**
 * A real model reads the page snapshot and picks the ref itself. The scripted
 * planner can't, so resolve its placeholder from the snapshot in the transcript.
 */
function resolveRef(response: LlmResponse, messages: LlmRequest['messages']): LlmResponse {
  const call = response.toolCalls?.find((candidate) => candidate.arguments.ref === PENDING_REF);

  if (!call) return response;
  const line = messages
    .flatMap((message) => message.content.split('\n'))
    .find((text) => text.includes('Display name'));

  call.arguments.ref = REF.exec(line ?? '')?.[1] ?? PENDING_REF;

  return response;
}

const demoLlm: Llm = async ({ messages }) => {
  const goal = messages.find((message) => message.role === 'user')?.content.split('\n')[0] ?? '';
  const plan = planFor(goal);
  const turn = turnOf(messages);

  await new Promise((resolve) => setTimeout(resolve, THINKING_MS));
  if (turn >= plan.length) return { text: plan.length ? 'Done — completed your request.' : NO_MATCH };

  return resolveRef({ toolCalls: [{ id: String(turn), ...plan[turn]! }] }, messages);
};

/** Answers one question, creating the copilot (and its visualizer) on first use. */
export function ask(question: string): Promise<{ text: string }> {
  copilot ??= createCopilot({
    llm: demoLlm,
    domFallback: true,
    visualize: { backdrop: { exclude: ['assistant-panel'] } },
  });

  return copilot.ask(question);
}

/** Clears the chips between questions, like gui-agent's demo does. */
export function clearSteps(): void {
  copilot?.visualizer?.clear();
}
