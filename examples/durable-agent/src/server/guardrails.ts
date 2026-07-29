import { injectionGuard, runProcessors, unicodeNormalizer, type InputProcessor } from '@janux/agent';

/** Classic injection framings; swap for a model-based classifier in production. */
const HOSTILE_PATTERNS = [
  /ignore\s+(all|any|previous|prior|the)\b.*\b(instructions|rules)/i,
  /disregard\s+(the|your|all)\b.*\b(instructions|rules|guardrails)/i,
  /reveal\s+(the|your)\b.*\b(system prompt|instructions|secrets?)/i,
  /you are now\b.*\b(dan|developer mode|jailbroken)/i,
];

/**
 * What the UI answers when a turn is refused. The framework returns a typed
 * `{ type: 'refusal', reason }` — the human-readable reply is the app's call.
 */
export const SAFE_REFUSAL = 'I can’t help with that request. Ask me about your workspace instead.';

export function classifyPrompt(text: string): 'ok' | 'suspicious' {
  return HOSTILE_PATTERNS.some((pattern) => pattern.test(text)) ? 'suspicious' : 'ok';
}

/** Order matters: normalize first so the classifier sees what the model would see. */
export function guardrails(): InputProcessor[] {
  return [unicodeNormalizer(), injectionGuard(classifyPrompt)];
}

/** Screens a would-be user turn: allowed, or blocked with the safe reply. */
export async function screenInput(text: string): Promise<{ allowed: boolean; reply?: string }> {
  const turn = await runProcessors(guardrails(), { messages: [{ role: 'user', content: text }] });

  if (turn.aborted) return { allowed: false, reply: SAFE_REFUSAL };

  return { allowed: true };
}
