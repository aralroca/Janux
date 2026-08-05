import type { ChatMessage } from '../providers';

/**
 * Guardrail processor pipeline (RFC 0002 §20): ordered input processors run
 * before every turn; any can rewrite the messages or abort with a typed
 * refusal. Ports of the didit-assistant pipeline: unicode normalization,
 * history token budget, PII scrub, plus a pluggable injection classifier.
 */

/**
 * Pipeline messages include the system prompt (providers carry it separately).
 *
 * `untrusted` marks a message that wears the `user` role for provider
 * compatibility but is machine output — executed tool results travelling back
 * into the same turn. It is the message-layer half of the taint rules: what a
 * tool produced never counts as what the person asked (see `janux/taint`).
 */
export type TurnMessage = ((Omit<ChatMessage, 'role'> & { role: ChatMessage['role'] | 'system' }) | ChatMessage) & {
  untrusted?: boolean;
};

export interface TurnContext {
  messages: TurnMessage[];
  aborted?: { reason: string };
  /**
   * Non-fatal findings, in the order the processors reported them. Without this a
   * guard in `warn` mode was a silent no-op: an operator who chose to observe
   * before blocking saw nothing at all and would conclude nothing was happening.
   */
  warnings?: string[];
}

export interface InputProcessor {
  name: string;
  run(turn: TurnContext): Promise<TurnContext> | TurnContext;
}

export async function runProcessors(processors: InputProcessor[], turn: TurnContext): Promise<TurnContext> {
  let current = turn;

  for (const processor of processors) {
    current = await processor.run(current);
    if (current.aborted) return current;
  }

  return current;
}

/** NFKC-normalizes text content and strips control characters (homoglyph smuggling). */
export function unicodeNormalizer(): InputProcessor {
  const clean = (text: string) => text.normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E]/g, '');

  return {
    name: 'unicode-normalizer',
    run(turn) {
      return {
        ...turn,
        messages: turn.messages.map((message) =>
          typeof message.content === 'string' ? { ...message, content: clean(message.content) } : message,
        ),
      };
    },
  };
}

/** ~4 chars/token heuristic — same order of magnitude the assistant uses. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Caps the turn's history by an approximate token budget: drops the OLDEST
 * non-system messages first, never the system prompt or the newest user turn.
 */
export function historyTokenBudget(maxInputTokens: number): InputProcessor {
  return {
    name: 'history-token-budget',
    run(turn) {
      const system = turn.messages.filter((message) => message.role === 'system');
      const rest = [...turn.messages.filter((message) => message.role !== 'system')];
      const size = (message: TurnMessage) => approxTokens(typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
      let total = [...system, ...rest].reduce((sum, message) => sum + size(message), 0);

      while (total > maxInputTokens && rest.length > 1) {
        total -= size(rest.shift()!);
      }

      return { ...turn, messages: [...system, ...rest] };
    },
  };
}

/**
 * Most specific first. The phone pattern (9–15 digits) overlaps a card number, so
 * with phone ahead of card `4111 1111 1111 1111` scrubbed to `[phone]1111` —
 * masking part of it and leaving four digits in the clear. Card is checked first.
 */
const PII_PATTERNS: [RegExp, string][] = [
  // Bounded per RFC 5321 (local-part ≤ 64, domain ≤ 255), and that bound is what
  // makes it linear. Unbounded, `[\w.+-]+` matched an entire separator-heavy string
  // and then backtracked one character at a time looking for `@`, at every start
  // position: 20k chars took 198ms and 40k took 776ms — quadratic, and a scrub that
  // runs on untrusted text before every turn. Caught by the DoS budget in CI.
  [/\b[\w.+-]{1,64}@[\w-]{1,255}\.[\w.]{1,255}\b/g, '[email]'],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{2,4}\b/g, '[card]'],
  // Ends on a digit. `(?:\+?\d[\s-]?){9,15}` let the trailing separator inside the
  // repetition be consumed, so `ring 600123456 please` scrubbed to
  // `ring [phone]please` — the mask swallowed the following space and joined words.
  [/\b\+?\d(?:[\s-]?\d){8,14}\b/g, '[phone]'],
];

/** Scrubs common PII shapes from text content (observability-bound copies use this too). */
export function piiFilter(): InputProcessor {
  const scrub = (text: string) => PII_PATTERNS.reduce((current, [pattern, mask]) => current.replace(pattern, mask), text);

  return {
    name: 'pii-filter',
    run(turn) {
      return {
        ...turn,
        messages: turn.messages.map((message) =>
          typeof message.content === 'string' ? { ...message, content: scrub(message.content) } : message,
        ),
      };
    },
  };
}

/**
 * Prompt-injection guard: a pluggable classifier (cheap LLM or heuristic)
 * inspects the newest user message; `block` aborts the turn, `warn` annotates.
 */
export function injectionGuard(
  classify: (text: string) => Promise<'ok' | 'suspicious'> | 'ok' | 'suspicious',
  mode: 'warn' | 'block' = 'block',
): InputProcessor {
  return {
    name: 'injection-guard',
    async run(turn) {
      const latest = [...turn.messages].reverse().find((message) => message.role === 'user' && !message.untrusted);
      const text = typeof latest?.content === 'string' ? latest.content : '';

      if (!text) return turn;
      if ((await classify(text)) === 'ok') return turn;
      if (mode === 'block') return { ...turn, aborted: { reason: 'prompt_injection' } };

      return { ...turn, warnings: [...(turn.warnings ?? []), 'prompt_injection'] };
    },
  };
}
