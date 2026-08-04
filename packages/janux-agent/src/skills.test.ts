import { describe, expect, it } from 'bun:test';
import { jsx, schema, str } from 'janux';
import { api, createJanuxServer, parseSkill } from '@janux/server';
import { defineAgent } from './agent';

/**
 * Skills in the agent loop: the index is always in the prompt, the body never
 * is until the model asks for it — and asking is a *read*, so nothing about the
 * invocation pipeline changes.
 */

const refund = parseSkill(
  [
    '---',
    'description: Refund an order end to end.',
    'when: The customer asks for their money back.',
    'tools: [api.shop.search]',
    '---',
    '1. Find the order with `api.shop.search`.',
    '2. Refund it.',
  ].join('\n'),
  'refund-order',
);

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), { status: 200 });
}

function scriptedFetch(replies: Response[]) {
  const calls: { body: any }[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });

    return replies.shift() ?? anthropicReply([{ type: 'text', text: 'done' }]);
  };

  return { fetchImpl, calls };
}

let searched = 0;

function buildServer(agent: ReturnType<typeof defineAgent>, skills = [refund]) {
  return createJanuxServer({
    routes: { '/': () => jsx('main', { children: 'home' }) },
    apis: {
      shop: {
        search: api({
          description: 'Search orders',
          input: schema({ q: str() }),
          run: ({ input }) => {
            searched += 1;

            return [`found:${input.q}`];
          },
        }),
      },
    },
    skills,
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
const turn = { messages: [{ role: 'user', content: 'refund my order' }] };

describe('skills in the agent loop', () => {
  it('puts the index in the system prompt and keeps the body out of it', async () => {
    const { fetchImpl, calls } = scriptedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);

    await ask(buildServer(defineAgent({}, { env, fetchImpl })), turn);
    const { system } = calls[0]!.body;

    expect(system).toContain('refund-order');
    expect(system).toContain('Refund an order end to end.');
    expect(system).toContain('The customer asks for their money back.');
    expect(system).not.toContain('Find the order with');
  });

  it('offers load_skill only to an app that has skills', async () => {
    const withSkills = scriptedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);
    const without = scriptedFetch([anthropicReply([{ type: 'text', text: 'ok' }])]);

    await ask(buildServer(defineAgent({}, { env, fetchImpl: withSkills.fetchImpl })), turn);
    await ask(buildServer(defineAgent({}, { env, fetchImpl: without.fetchImpl }), []), turn);
    const names = (call: any) => call.body.tools.map((tool: any) => tool.name);

    expect(names(withSkills.calls[0])).toContain('load_skill');
    expect(names(without.calls[0])).not.toContain('load_skill');
  });

  it('answers load_skill with the body, in the same turn, without touching a tool', async () => {
    searched = 0;
    const { fetchImpl, calls } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'load_skill', input: { skill: 'refund-order' } }]),
      anthropicReply([{ type: 'text', text: 'Following the procedure.' }]),
    ]);
    const body: any = await (await ask(buildServer(defineAgent({}, { env, fetchImpl })), turn)).json();

    expect(body.type).toBe('text');
    const observed = calls[1]!.body.messages.find((message: any) => message.content?.[0]?.type === 'tool_result');

    expect(observed.content[0].content).toContain('Find the order with `api.shop.search`');
    // A skill is documentation. Loading one runs nothing.
    expect(searched).toBe(0);
  });

  it('never sends load_skill to the browser as a ui call', async () => {
    const { fetchImpl } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'load_skill', input: { skill: 'refund-order' } }]),
      anthropicReply([{ type: 'text', text: 'done' }]),
    ]);
    const body: any = await (await ask(buildServer(defineAgent({}, { env, fetchImpl })), turn)).json();

    expect(body.type).toBe('text');
  });

  it('names the skills that do exist when the model invents one', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      anthropicReply([{ type: 'tool_use', id: 't1', name: 'load_skill', input: { skill: 'invented' } }]),
      anthropicReply([{ type: 'text', text: 'sorry' }]),
    ]);

    await ask(buildServer(defineAgent({}, { env, fetchImpl })), turn);
    const observed = calls[1]!.body.messages.find((message: any) => message.content?.[0]?.type === 'tool_result');

    expect(observed.content[0].content).toContain('invented');
    expect(observed.content[0].content).toContain('refund-order');
  });
});
