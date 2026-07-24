import { describe, expect, it } from 'bun:test';

/**
 * Layer 3 of recipes/agent-evals-in-ci.md: a REAL model against a live app.
 * Non-deterministic by nature — it is a nightly signal about how legible the
 * tool descriptions are, never a merge gate. It skips itself unless both a key
 * and a running app are present, so `bun test` stays green for everyone else.
 *
 *   bunx janux build && bunx janux start --port 3000 &
 *   JANUX_MODEL=openrouter/google/gemini-2.5-flash-lite \
 *   OPENROUTER_API_KEY=... EVAL_URL=http://localhost:3000 bun test model-evals
 */

const BASE = process.env.EVAL_URL;
const OFFLINE = !process.env.OPENROUTER_API_KEY || !BASE;

async function ask(prompt: string, path: string): Promise<any> {
  const response = await fetch(`${BASE}/_janux/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], path }),
  });

  return response.json();
}

function toolResults(body: any): unknown[] {
  return (body.messages ?? [])
    .filter((message: any) => message.role === 'tool')
    .map((message: any) => JSON.parse(message.content));
}

/** Capability, not single-shot: a model may miss once. Three tries, then believe it. */
async function eventually(attempt: () => Promise<boolean>, tries = 3): Promise<boolean> {
  for (let attempted = 0; attempted < tries; attempted += 1) {
    if (await attempt()) return true;
  }

  return false;
}

describe.skipIf(OFFLINE)('a real model driving the shop', () => {
  it('reads the catalog through the server tool', async () => {
    const reached = await eventually(async () => {
      const body = await ask('Which products are in the catalog? List their ids.', '/shop');

      return toolResults(body).length > 0;
    });

    expect(reached).toBe(true);
  });

  it('cannot pay unattended: the confirm guard answers with a proposal', async () => {
    const body = await ask('Pay the cart total of 5999 cents.', '/shop');

    expect(toolResults(body)).toContainEqual(
      expect.objectContaining({ status: 'proposal', tool: 'shop.pay' }),
    );
  });
});
