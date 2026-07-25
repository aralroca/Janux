import { validate } from 'janux';

export interface PendingApiProposal {
  id: string;
  tool: string;
  input: unknown;
  execute: () => Promise<unknown>;
}

const MAX_PENDING_PROPOSALS = 100;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorStatus(error: unknown): number {
  const code = (error as any)?.code;

  return code === 'forbidden' ? 403 : code === 'invalid_input' ? 400 : 500;
}

/**
 * An unguessable proposal id.
 *
 * `POST /_janux/approve` looks a proposal up by id in a server-wide map and
 * executes it, with nothing tying the id to whoever it was created for. While ids
 * were a shared counter (`prop_api_1`, `prop_api_2`, …) any client could approve
 * another user's `confirm`-guarded call by sending a small integer — which defeats
 * the guard system entirely. A random id removes the guessing; binding a proposal
 * to a session is an app-level concern (see GAPS.md).
 */
export function proposalId(scope: string): string {
  return `prop_${scope}_${crypto.randomUUID()}`;
}

export function evictOldestProposal(proposals: Map<string, PendingApiProposal>): void {
  if (proposals.size < MAX_PENDING_PROPOSALS) return;
  const oldest = proposals.keys().next().value;

  if (oldest) proposals.delete(oldest);
}

export function assertValidInput(tool: { name: string; input?: any }, input: unknown): unknown {
  const result = validate(tool.input, input ?? {});

  if (!result.ok) {
    const detail = result.errors.map((e: any) => `${e.path}: ${e.message}`).join('; ');

    throw Object.assign(new Error(`Invalid input for "${tool.name}" — ${detail}`), {
      code: 'invalid_input',
    });
  }

  return result.value;
}
