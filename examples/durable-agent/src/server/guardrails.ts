import { injectionGuard, unicodeNormalizer, type InputProcessor } from '@janux/agent';

/** Classic injection framings; swap for a model-based classifier in production. */
const HOSTILE_PATTERNS = [
  /ignore\s+(all|any|previous|prior|the)\b.*\b(instructions|rules)/i,
  /disregard\s+(the|your|all)\b.*\b(instructions|rules|guardrails)/i,
  /reveal\s+(the|your)\b.*\b(system prompt|instructions|secrets?)/i,
  /you are now\b.*\b(dan|developer mode|jailbroken)/i,
];

/**
 * What the UI answers when a turn is refused. Wired as `harness.refusalMessage`,
 * so the framework's `{ type: 'refusal', reason, message }` carries it — no
 * hand-mapping in the app.
 */
export const SAFE_REFUSAL = 'I can’t help with that request. Ask me about your workspace instead.';

export function classifyPrompt(text: string): 'ok' | 'suspicious' {
  return HOSTILE_PATTERNS.some((pattern) => pattern.test(text)) ? 'suspicious' : 'ok';
}

/** Order matters: normalize first so the classifier sees what the model would see. */
export function guardrails(): InputProcessor[] {
  return [unicodeNormalizer(), injectionGuard(classifyPrompt)];
}
