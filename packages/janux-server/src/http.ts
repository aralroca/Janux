import { validate } from 'janux';

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
