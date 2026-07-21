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
