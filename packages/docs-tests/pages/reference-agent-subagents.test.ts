import { describe, expect, it } from 'bun:test';
import { defineAgent } from '@janux/agent';
import { api, createJanuxServer } from '@janux/server';
import { schema, str } from 'janux';

/**
 * reference/agent-subagents.md — every claim the page makes about composing
 * agents, run against a scripted provider: the mandatory budget, the fresh
 * history, the intersection rule (never an escalation), the budget cuts, the
 * rate-limit slot per delegation, and the handoff transfer with its sticky
 * `agent` envelope field.
 */

const reply = (content: unknown[]) =>
  new Response(JSON.stringify({ content }), { headers: { 'content-type': 'application/json' } });
const text = (value: string) => reply([{ type: 'text', text: value }]);
const toolUse = (id: string, name: string, input: unknown = {}) => reply([{ type: 'tool_use', id, name, input }]);

function app(replies: Response[], config: Record<string, unknown> = {}) {
  const calls: any[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));

    return replies.shift() ?? text('done');
  };
  const server = createJanuxServer({
    apis: {
      support: { search: api({ description: 'Search', input: schema({ q: str() }), run: ({ input }) => [`found:${input.q}`] }) },
      admin: { purge: api({ description: 'Wipe', run: () => 'purged' }) },
    },
    agent: defineAgent(config as any, { env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl }),
  });
  const ask = (body: unknown) =>
    server.fetch(
      new Request('http://test/_janux/agent', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

  return { ask, calls };
}

const RESEARCH = {
  description: 'Looks facts up.',
  instructions: 'You are the research subagent.',
  tools: { include: ['api.*'] },
  budget: { maxTurns: 2 },
};
const userTurn = { messages: [{ role: 'user', content: 'look this up' }] };

describe('reference/agent-subagents.md — subagents', () => {
  it('the budget is mandatory: defineAgent throws without maxTurns >= 1', () => {
    expect(() => defineAgent({ subagents: { research: { ...RESEARCH, budget: { maxTurns: 0 } } } } as any)).toThrow(/maxTurns/);
  });

  it('delegate.<name> runs a fresh-history loop on the subagent prompt and reports back', async () => {
    const { ask, calls } = app(
      [toolUse('d1', 'delegate__research', { task: 'find it' }), text('found (kb-1)'), text('done')],
      { subagents: { research: RESEARCH } },
    );

    expect(((await (await ask(userTurn)).json()) as any).text).toBe('done');
    expect(String(calls[1].system)).toContain('research subagent');
    expect(calls[1].messages).toHaveLength(1); // fresh history: the task, nothing else
    const report = calls[2].messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(report.content[0].content).toContain('found (kb-1)');
  });

  it('the intersection rule: a parent exclusion holds even when the subagent model calls the tool', async () => {
    const { ask, calls } = app(
      [toolUse('d1', 'delegate__research', { task: 'purge' }), toolUse('s1', 'api__admin__purge'), text('refused'), text('done')],
      { tools: { exclude: ['api.admin.*'] }, subagents: { research: RESEARCH } },
    );

    await ask(userTurn);
    expect(calls[1].tools.map((tool: any) => tool.name)).not.toContain('api__admin__purge');
    const refusal = calls[2].messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(refusal.content[0].content).toContain('tool_forbidden');
  });

  it('a budget line cuts the loop and the report says which: stopReason max_turns', async () => {
    const loop = () => toolUse('s1', 'api__support__search', { q: 'x' });
    const { ask, calls } = app(
      [toolUse('d1', 'delegate__research', { task: 'x' }), loop(), loop(), text('done')],
      { subagents: { research: RESEARCH } },
    );

    await ask(userTurn);
    const report = calls.at(-1).messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(report.content[0].content).toContain('max_turns');
  });

  it('each delegation spends one slot of the caller rate limit', async () => {
    const { ask, calls } = app(
      [toolUse('d1', 'delegate__research', { task: 'one' }), text('ok'), toolUse('d2', 'delegate__research', { task: 'two' }), text('gave up')],
      {
        subagents: { research: RESEARCH },
        harness: { identityFor: () => 'ada', rateLimit: { limit: 2, windowMs: 60_000 } },
      },
    );

    await ask(userTurn);
    const refusal = calls.at(-1).messages.findLast((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(refusal.content[0].content).toContain('rate_limited');
  });
});

describe('reference/agent-subagents.md — handoffs', () => {
  const BILLING = { description: 'Money.', instructions: 'You are the billing specialist.', tools: { include: ['api.support.*'] } };

  it('handoff.<name> swaps prompt and tools, drops the tool noise and marks the envelope', async () => {
    const noisy = [
      { role: 'user', content: 'refund me' },
      { role: 'tool', toolCallId: 'x', content: 'old tool noise' },
      { role: 'user', content: 'please' },
    ];
    const { ask, calls } = app(
      [toolUse('h1', 'handoff__billing', { reason: 'money' }), text('Refunded.')],
      { instructions: 'Front desk.', handoffs: { billing: BILLING } },
    );
    const body: any = await (await ask({ messages: noisy })).json();

    expect(body).toMatchObject({ type: 'text', text: 'Refunded.', agent: 'billing' });
    expect(String(calls[1].system)).toContain('billing specialist');
    expect(String(calls[1].system)).toContain('money');
    expect(JSON.stringify(calls[1].messages)).not.toContain('old tool noise');
  });

  it('the transfer is sticky: a turn addressed to the target starts as the target, unknown names are a 400', async () => {
    const { ask, calls } = app([text('Billing here.')], { handoffs: { billing: BILLING } });
    const body: any = await (await ask({ agent: 'billing', messages: [{ role: 'user', content: 'invoice?' }] })).json();

    expect(body.agent).toBe('billing');
    expect(String(calls[0].system)).toContain('billing specialist');

    const rejected = await ask({ agent: 'ghost', messages: [{ role: 'user', content: 'hi' }] });

    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as any).error).toBe('unknown_agent');
  });
});
