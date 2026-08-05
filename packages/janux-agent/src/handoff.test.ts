import { afterEach, describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { recordingTracer } from '../../janux/src/observability/__fixtures__/recording-tracer';
import { setTracer } from 'janux/observability';
import { defineAgent, type AgentConfig } from './agent';

afterEach(() => setTracer(undefined));

const counter = component({
  name: 'counter',
  state: schema({ label: str() }),
  intents: { rename: intent({ input: schema({ label: str() }), run: () => {} }) },
  view: () => jsx('p', { children: 'hi' }),
});

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), { status: 200 });
}

const text = (reply: string) => anthropicReply([{ type: 'text', text: reply }]);
const toolUse = (id: string, name: string, input: unknown) => anthropicReply([{ type: 'tool_use', id, name, input }]);

function scriptedFetch(replies: Response[]) {
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });

    return replies.shift() ?? text('done');
  };

  return { fetchImpl, calls };
}

function buildServer(agent: ReturnType<typeof defineAgent>) {
  return createJanuxServer({
    routes: { '/': () => jsx(counter as any, {}) },
    apis: {
      kb: { search: api({ description: 'Search', input: schema({ q: str() }), run: ({ input }) => [`kb:${input.q}`] }) },
      billing: { refund: api({ description: 'Refund an order', input: schema({ order: str() }), run: ({ input }) => `refunded:${input.order}` }) },
    },
    agent,
  });
}

const ask = (server: ReturnType<typeof buildServer>, body: unknown) =>
  server.fetch(
    new Request('http://test/_janux/agent', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    }),
  );

const env = { ANTHROPIC_API_KEY: 'sk-test' };
const BILLING: NonNullable<AgentConfig['handoffs']>[string] = {
  description: 'Handles refunds and invoices.',
  instructions: 'You are the BILLING specialist.',
  tools: { include: ['api.billing.*'] },
};
const BASE: AgentConfig = {
  instructions: 'You are the PARENT copilot.',
  handoffs: { billing: BILLING },
  subagents: {
    research: { description: 'Research.', instructions: 'Research subagent.', budget: { maxTurns: 2 } },
  },
};
const noisyHistory = [
  { role: 'user', content: 'I was double charged' },
  { role: 'assistant', content: 'let me check' },
  { role: 'tool', toolCallId: 'x1', content: 'noise from an old tool round' },
  { role: 'user', content: '[ui tool results] [{"name":"ui_read_page"}]' },
  { role: 'user', content: 'please refund me' },
];

describe('handoff declaration', () => {
  it('advertises one handoff tool per target, description included', async () => {
    const { fetchImpl, calls } = scriptedFetch([text('ok')]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));

    await ask(server, { messages: [{ role: 'user', content: 'hi' }] });
    const handoff = calls[0]!.body.tools.find((tool: any) => tool.name === 'handoff__billing');

    expect(handoff).toBeDefined();
    expect(handoff.description).toContain('Handles refunds and invoices.');
  });
});

describe('handoff transfers the conversation', () => {
  it('swaps the system prompt, keeps the dialogue and drops the tool noise', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      toolUse('h1', 'handoff__billing', { reason: 'refund request' }),
      text('Refund issued.'),
    ]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: noisyHistory })).json();

    expect(body).toMatchObject({ type: 'text', text: 'Refund issued.', agent: 'billing' });
    const transferred = calls[1]!.body;

    expect(String(transferred.system)).toContain('You are the BILLING specialist.');
    expect(String(transferred.system)).toContain('refund request');
    expect(String(transferred.system)).not.toContain('You are the PARENT copilot.');
    const wire = JSON.stringify(transferred.messages);

    expect(wire).toContain('I was double charged');
    expect(wire).toContain('let me check');
    expect(wire).toContain('please refund me');
    expect(wire).not.toContain('noise from an old tool round');
    expect(wire).not.toContain('[ui tool results]');
    expect(wire).not.toContain('tool_use');
  });

  it('gives the target its own tool surface: no composition tools, client tools kept', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      toolUse('h1', 'handoff__billing', { reason: 'refund' }),
      text('done'),
    ]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));

    await ask(server, { messages: noisyHistory });
    const names = calls[1]!.body.tools.map((tool: any) => tool.name);

    expect(names).toContain('api__billing__refund');
    expect(names).toContain('ui_navigate');
    expect(names).not.toContain('api__kb__search');
    expect(names).not.toContain('counter__rename');
    expect(names).not.toContain('handoff__billing');
    expect(names).not.toContain('delegate__research');
  });

  it('a ui_calls envelope after the handoff carries the active agent, so the continuation resumes as the target', async () => {
    const { fetchImpl } = scriptedFetch([
      toolUse('h1', 'handoff__billing', {}),
      toolUse('u1', 'ui_navigate', { path: '/billing' }),
    ]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: noisyHistory })).json();

    expect(body.type).toBe('ui_calls');
    expect(body.agent).toBe('billing');
  });

  it('refuses a handoff to a target the model invented', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      toolUse('h1', 'handoff__made_up', {}),
      text('sorry'),
    ]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));
    const body: any = await (await ask(server, { messages: noisyHistory })).json();

    expect(body).toMatchObject({ type: 'text', text: 'sorry' });
    expect(body.agent).toBeUndefined();
    const refusal = calls[1]!.body.messages.findLast((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(refusal.content[0].content).toContain('unknown_agent');
  });

  it('fails loudly when the target declares a model no key can resolve', async () => {
    const withModel: AgentConfig = { handoffs: { billing: { ...BILLING, model: 'openai/gpt-5.2' } } };
    const { fetchImpl } = scriptedFetch([toolUse('h1', 'handoff__billing', {})]);
    const server = buildServer(defineAgent(withModel, { env, fetchImpl }));
    const response = await ask(server, { messages: noisyHistory });

    expect(response.status).toBe(502);
    expect(((await response.json()) as any).error).toBe('handoff_model_unavailable');
  });
});

describe('handoff is sticky across turns', () => {
  it('a turn addressed to the target starts as the target', async () => {
    const { fetchImpl, calls } = scriptedFetch([text('Still billing here.')]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));
    const body: any = await (
      await ask(server, { agent: 'billing', messages: [{ role: 'user', content: 'and my invoice?' }] })
    ).json();

    expect(body).toMatchObject({ type: 'text', text: 'Still billing here.', agent: 'billing' });
    expect(String(calls[0]!.body.system)).toContain('You are the BILLING specialist.');
    const names = calls[0]!.body.tools.map((tool: any) => tool.name);

    expect(names).not.toContain('handoff__billing');
  });

  it('rejects a turn addressed to an agent that does not exist', async () => {
    const { fetchImpl } = scriptedFetch([text('never')]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));
    const response = await ask(server, { agent: 'ghost', messages: [{ role: 'user', content: 'hi' }] });

    expect(response.status).toBe(400);
    expect(((await response.json()) as any).error).toBe('unknown_agent');
  });

  it('name lookups stay off the prototype chain: "constructor" is not an agent', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      toolUse('h1', 'handoff__constructor', {}),
      text('sorry'),
    ]);
    const server = buildServer(defineAgent(BASE, { env, fetchImpl }));

    expect((await ask(server, { agent: 'constructor', messages: [{ role: 'user', content: 'hi' }] })).status).toBe(400);
    const body: any = await (await ask(server, { messages: noisyHistory })).json();

    expect(body).toMatchObject({ type: 'text', text: 'sorry' });
    const refusal = calls[1]!.body.messages.findLast((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(refusal.content[0].content).toContain('unknown_agent');
  });
});

describe('handoff traces (punto 18 coherence)', () => {
  it('marks the turn span with the transfer', async () => {
    const tracer = recordingTracer();
    const { fetchImpl } = scriptedFetch([
      toolUse('h1', 'handoff__billing', { reason: 'refund' }),
      text('done'),
    ]);
    const server = buildServer(defineAgent({ ...BASE, model: 'anthropic/claude-fable-5' }, { env, fetchImpl }));

    setTracer(tracer);
    await ask(server, { messages: noisyHistory });

    const turnSpan = tracer.spans.find((span) => span.name === 'invoke_agent janux')!;

    expect(turnSpan.attributes).toMatchObject({
      'janux.handoff.to': 'billing',
      'gen_ai.agent.name': 'billing',
    });
  });
});
