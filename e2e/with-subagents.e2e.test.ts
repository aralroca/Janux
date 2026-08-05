import { describe, expect, it } from 'bun:test';
import { createTestApp } from '@janux/testing';
import { defineAgent } from '../packages/janux-agent/src/agent';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { supportDesk } from '../examples/with-subagents/src/agent';
import { purge } from '../examples/with-subagents/src/server/admin.api';
import { invoice, refund } from '../examples/with-subagents/src/server/billing.api';
import { search } from '../examples/with-subagents/src/server/support.api';
import { appRoot } from './support/app';

/**
 * examples/with-subagents: the example's REAL agent config — front desk +
 * research subagent + billing handoff — driven over the real HTTP agent
 * endpoint with a scripted provider, the same way `janux eval` scripts one.
 */

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), { status: 200 });
}

const text = (reply: string) => anthropicReply([{ type: 'text', text: reply }]);
const toolUse = (id: string, name: string, input: unknown) => anthropicReply([{ type: 'tool_use', id, name, input }]);

function scriptedServer(replies: Response[]) {
  const calls: { body: any }[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });

    return replies.shift() ?? text('done');
  };
  const agent = defineAgent(supportDesk, { env: { ANTHROPIC_API_KEY: 'sk-e2e' }, fetchImpl });
  const server = createJanuxServer({
    apis: { support: { search }, billing: { invoice, refund }, admin: { purge } },
    agent,
  });
  const ask = (body: unknown) =>
    server.fetch(
      new Request('http://test/_janux/agent', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

  return { calls, ask };
}

describe('examples/with-subagents SSR', () => {
  it('serves the home page with both demo surfaces', async () => {
    const app = await createTestApp(appRoot('examples/with-subagents'));
    const home = await app.fetch('/');

    expect(home.status).toBe(200);
    const html = await home.text();

    expect(html).toContain('Subagents');
    expect(html).toContain('kb-1');
    expect(html).toContain('A-1002');
  });
});

describe('examples/with-subagents delegation', () => {
  it('the front desk delegates to research, which answers from the knowledge base', async () => {
    const { calls, ask } = scriptedServer([
      toolUse('d1', 'delegate__research', { task: 'What is an island in Janux?' }),
      toolUse('s1', 'api__support__search', { q: 'islands' }),
      text('Only islands ship JavaScript (kb-2).'),
      text('Islands are the only parts that ship JavaScript.'),
    ]);
    const body: any = await (await ask({ messages: [{ role: 'user', content: 'what is an island?' }] })).json();

    expect(body).toMatchObject({ type: 'text', text: 'Islands are the only parts that ship JavaScript.' });
    // The research subagent ran on its own prompt with the real kb result.
    expect(String(calls[1]!.body.system)).toContain('research subagent');
    const kbResult = calls[2]!.body.messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(kbResult.content[0].content).toContain('0-JS guarantee');
  });

  it('research cannot reach admin.purge: excluded for the parent means excluded for the delegate', async () => {
    const { calls, ask } = scriptedServer([
      toolUse('d1', 'delegate__research', { task: 'purge everything' }),
      toolUse('s1', 'api__admin__purge', {}),
      text('I cannot do that.'),
      text('The subagent refused.'),
    ]);
    const body: any = await (await ask({ messages: [{ role: 'user', content: 'purge the ledger' }] })).json();

    expect(body.type).toBe('text');
    // Never advertised to the subagent, and refused when called anyway.
    expect(calls[1]!.body.tools.map((tool: any) => tool.name)).not.toContain('api__admin__purge');
    const refusal = calls[2]!.body.messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(refusal.content[0].content).toContain('tool_forbidden');
  });
});

describe('examples/with-subagents handoff', () => {
  it('a refund conversation transfers to billing, which resolves it with its own tools', async () => {
    const { calls, ask } = scriptedServer([
      toolUse('h1', 'handoff__billing', { reason: 'refund request' }),
      toolUse('b1', 'api__billing__refund', { order: 'A-1002' }),
      text('Refunded A-1002: $19.'),
    ]);
    const body: any = await (await ask({ messages: [{ role: 'user', content: 'refund order A-1002' }] })).json();

    expect(body).toMatchObject({ type: 'text', text: 'Refunded A-1002: $19.', agent: 'billing' });
    expect(String(calls[1]!.body.system)).toContain('billing specialist');
    const refunded = calls[2]!.body.messages.find((m: any) => m.content?.[0]?.type === 'tool_result');

    expect(refunded.content[0].content).toContain('"refunded":"A-1002"');
  });
});
