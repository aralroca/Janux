import { describe, expect, it } from 'bun:test';
import { defineAgent } from './agent';

const ENV = { ANTHROPIC_API_KEY: 'test-key' };

function anthropicReply(blocks: unknown[]): Response {
  return new Response(JSON.stringify({ content: blocks }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function llmRequest(body: unknown): Request {
  return new Request('http://localhost/_janux/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/_janux/llm handler', () => {
  it('answers with a setup card (503) when no model is configured', async () => {
    const mount = defineAgent({}, { env: {} });
    const response = await mount.handleLlm!(llmRequest({ messages: [], tools: [] }));

    expect(response.status).toBe(503);
    expect(((await response.json()) as any).type).toBe('setup');
  });

  it('proxies one turn: system extracted, tools mapped, arguments round-tripped', async () => {
    let sent: any;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);

      return anthropicReply([
        { type: 'text', text: 'Searching…' },
        { type: 'tool_use', id: 'call_1', name: 'search_docs', input: { query: 'islands' } },
      ]);
    };
    const mount = defineAgent({}, { env: ENV, fetchImpl });
    const response = await mount.handleLlm!(
      llmRequest({
        messages: [
          { role: 'system', content: 'You answer from the docs.' },
          { role: 'user', content: 'What are islands?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'c0', name: 'search_docs', arguments: { query: 'x' } }] },
          { role: 'tool', content: '{"matches":[]}', toolCallId: 'c0' },
        ],
        tools: [{ name: 'search_docs', description: 'Search the docs', inputSchema: { type: 'object' } }],
      }),
    );
    const body = (await response.json()) as any;

    expect(sent.system).toBe('You answer from the docs.');
    expect(sent.tools).toEqual([{ name: 'search_docs', description: 'Search the docs', input_schema: { type: 'object' } }]);
    expect(sent.messages[0]).toEqual({ role: 'user', content: 'What are islands?' });
    expect(body.text).toBe('Searching…');
    expect(body.toolCalls).toEqual([{ id: 'call_1', name: 'search_docs', arguments: { query: 'islands' } }]);
  });

  it('sends modelOptions with every request, without letting them rewrite the turn', async () => {
    let sent: any;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);

      return anthropicReply([{ type: 'text', text: 'ok' }]);
    };
    const modelOptions = {
      reasoning: { enabled: false },
      provider: { sort: 'throughput' },
      messages: [{ role: 'user', content: 'hijacked' }],
    };
    const mount = defineAgent({ modelOptions }, { env: ENV, fetchImpl });

    await mount.handleLlm!(llmRequest({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

    expect(sent.reasoning).toEqual({ enabled: false });
    expect(sent.provider).toEqual({ sort: 'throughput' });
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('carries modelOptions on the OpenAI-compatible path too (OpenRouter)', async () => {
    let sent: any;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);

      return Response.json({ choices: [{ message: { content: 'ok' } }] });
    };
    const mount = defineAgent(
      { model: 'openrouter/deepseek/deepseek-v4-flash', modelOptions: { reasoning: { enabled: false } } },
      { env: { OPENROUTER_API_KEY: 'test-key' }, fetchImpl },
    );

    await mount.handleLlm!(llmRequest({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

    expect(sent.model).toBe('deepseek/deepseek-v4-flash');
    expect(sent.reasoning).toEqual({ enabled: false });
  });

  it('rate-limits the model proxy with the same harness budget as /_janux/agent', async () => {
    const fetchImpl = async () => anthropicReply([{ type: 'text', text: 'ok' }]);
    const mount = defineAgent(
      { harness: { rateLimit: { limit: 2, windowMs: 60_000 } } },
      { env: ENV, fetchImpl },
    );
    const ask = () => mount.handleLlm!(llmRequest({ messages: [], tools: [] }));

    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    const blocked = await ask();

    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as any).error).toBe('rate_limited');
  });

  it('fails closed on the model proxy when identityFor rejects the caller', async () => {
    const fetchImpl = async () => anthropicReply([{ type: 'text', text: 'ok' }]);
    const mount = defineAgent(
      { harness: { identityFor: () => undefined } },
      { env: ENV, fetchImpl },
    );
    const response = await mount.handleLlm!(llmRequest({ messages: [], tools: [] }));

    expect(response.status).toBe(401);
    expect(((await response.json()) as any).error).toBe('unauthorized');
  });

  it('tolerates an empty body', async () => {
    const fetchImpl = async () => anthropicReply([{ type: 'text', text: 'hi' }]);
    const mount = defineAgent({}, { env: ENV, fetchImpl });
    const response = await mount.handleLlm!(new Request('http://localhost/_janux/llm', { method: 'POST' }));

    expect(((await response.json()) as any).text).toBe('hi');
  });
});
