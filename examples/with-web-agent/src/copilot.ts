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
import { EXAMPLE_GOALS, PENDING_REF, planFor } from './demo-plan';

/** A real model takes a moment; the pause is what makes "Thinking…" visible. */
const THINKING_MS = 350;
const REF = /\[(e\d+)\]/;
const NO_MATCH = `I couldn't map that to an action. Try ${EXAMPLE_GOALS.map((goal) => `“${goal}”`).join(', ')}.`;

let copilot: Copilot | undefined;

/** The goal is the first user message; the turn is how many tool rounds ran. */
function turnOf(messages: LlmRequest['messages']): number {
  return messages.filter((message) => message.role === 'assistant' && message.toolCalls?.length).length;
}

/**
 * Reading the page snapshot and picking the ref is the model's job; standing in
 * for one, the planner emits a placeholder and this resolves it from the
 * snapshot already in the transcript.
 */
function resolveRef(call: { arguments: Record<string, unknown> }, messages: LlmRequest['messages']): void {
  if (call.arguments.ref !== PENDING_REF) return;
  const line = messages
    .flatMap((message) => message.content.split('\n'))
    .find((text) => text.includes('Display name'));

  call.arguments.ref = REF.exec(line ?? '')?.[1] ?? PENDING_REF;
}

const demoLlm: Llm = async ({ messages }): Promise<LlmResponse> => {
  const goal = messages.find((message) => message.role === 'user')?.content.split('\n')[0] ?? '';
  const plan = planFor(goal);
  const turn = turnOf(messages);

  await new Promise((resolve) => setTimeout(resolve, THINKING_MS));
  if (turn >= plan.length) return { text: plan.length ? 'Done — completed your request.' : NO_MATCH };
  const call = { id: String(turn), ...plan[turn]! };

  resolveRef(call, messages);

  return { toolCalls: [call] };
};

/** What each chip says while its tool runs; anything unlisted is humanized from its name. */
const LABELS = {
  'console.goToTab': (call: any) => `Opening ${call.arguments.tab}`,
  'users.search': (call: any) => `Searching “${call.arguments.value}”`,
  'team.invite': (call: any) => `Inviting ${call.arguments.email}`,
  'workflow.addStep': (call: any) => `Adding “${call.arguments.label}”`,
  read_page: 'Reading the page',
  fill: 'Filling the field',
};

/** Answers one question, creating the copilot (and its visualizer) on first use. */
export function ask(question: string): Promise<{ text: string }> {
  copilot ??= createCopilot({
    llm: demoLlm,
    domFallback: true,
    visualize: { labels: LABELS, backdrop: { exclude: ['assistant-panel'] } },
  });

  return copilot.ask(question);
}
