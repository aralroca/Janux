import type { Effect, GuardValue, Origin } from '../define/types';

/**
 * The two rules the invocation pipeline enforces on a chain that touched
 * untrusted content. They are checks, not advice: nothing here is written into
 * a prompt, and no app code can opt out of them (design invariant 4).
 */

/**
 * Rule 1 — provenance does not launder. `'human'` means a person drove this
 * call; a chain fed by a comment, a remote MCP answer or an uploaded file has
 * no person behind it, whatever the transport claims. So a `confirm` guard
 * still parks, and a dynamic guard reading `origin` sees what is true.
 */
export function originUnderTaint(origin: Origin, tainted?: boolean): Origin {
  return tainted ? 'agent' : origin;
}

/**
 * Rule 2 — untrusted content never triggers an irreversible effect unattended.
 * `auto` is a judgement the author made about their own app's callers; it was
 * never a judgement about a stranger's text. Only `auto` moves, and only ever
 * upwards, so a chain that is already gated stays exactly as gated.
 */
export function guardUnderTaint(guard: GuardValue, effect: Effect | undefined, tainted?: boolean): GuardValue {
  return tainted && effect === 'irreversible' && guard === 'auto' ? 'confirm' : guard;
}
