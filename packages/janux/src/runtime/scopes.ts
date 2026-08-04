import type { Ctx } from '../define/types';

/**
 * Authorization, which is a different question from identity.
 *
 * Web Bot Auth answers *who* is calling; a scope answers *what that caller may
 * do here*. Janux mints neither: `ctx.scopes` is whatever the app's own
 * provider granted this credential — a session cookie, a bearer token, an OIDC
 * access token's `scope` claim — and `ctx.agent.scopes` is how much of that
 * grant the agent acting for it may spend.
 *
 * Two rules, and the second is the whole point:
 *
 * 1. **A grant is explicit.** No `ctx.scopes` means no scopes, so a tool that
 *    declares any is unreachable until the app says otherwise. Tools without
 *    `scopes` are untouched — declaring them is the opt-in.
 * 2. **An agent can only narrow.** The effective grant is the intersection, so
 *    an agent that claims `admin` on a `read`-only session still gets `read`.
 *    "The agent acts as the user" stops being a promise in a doc and becomes
 *    arithmetic no app code can get wrong.
 *
 * The predicate is consumed twice on purpose — by the listings (`resolveGuard`,
 * `resolveApiGuard`, so an out-of-scope tool is not advertised) and by the
 * invocation pipeline (so it is not callable either). An invisible tool is not
 * a protected tool; it has to be both.
 */
export function grantedScopes(ctx: Ctx): string[] {
  const granted = listOf(ctx.scopes) ?? [];
  const agent = listOf(ctx.agent?.scopes);

  return agent ? granted.filter((scope) => agent.includes(scope)) : granted;
}

/**
 * Anything that is not a list of scopes is not a grant. `ctx` is a
 * `Record<string, unknown>` at runtime, and a single string got through as
 * one: `'admin'.includes('admin')` is true, so a typo'd grant would have
 * passed the check below instead of failing it. Like `normalizeGuard`, the
 * unanswerable case denies.
 */
function listOf(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;

  return Array.isArray(value) ? value : [];
}

/** Whether this context may invoke something requiring `required`. No requirement ⇒ yes. */
export function allowsScopes(ctx: Ctx, required?: string[]): boolean {
  if (!required?.length) return true;
  const granted = grantedScopes(ctx);

  return required.every((scope) => granted.includes(scope));
}
