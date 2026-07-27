import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import type { LlmRequest, LlmResponse } from '@aralroca/gui-agent';

GlobalRegistrator.register({ url: 'https://app.test/' });

const { registry, defineTool } = await import('@aralroca/gui-agent');
const { createCopilot } = await import('./copilot');
const { serverLlm } = await import('./llm');

afterAll(() => GlobalRegistrator.unregister());
afterEach(() => {
  registry.clear();
  delete (window as any).janux;
});

async function collect(stream: ReadableStream<any>): Promise<any[]> {
  const chunks: any[] = [];

  for await (const chunk of stream as any) chunks.push(chunk);

  return chunks;
}

/** The chunks the server mount would push for a turn, replayed through `subscribe`. */
function fakeStreamingLlm(turns: { chunks: unknown[]; reply: LlmResponse }[]) {
  const listeners = new Set<(chunk: any) => void>();
  let turn = 0;
  const llm: any = async (_request: LlmRequest): Promise<LlmResponse> => {
    const current = turns[turn++]!;

    current.chunks.forEach((chunk) => listeners.forEach((listener) => listener(chunk)));

    return current.reply;
  };

  llm.subscribe = (listener: (chunk: any) => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
  };

  return llm;
}

describe('copilot.stream', () => {
  it('merges the server turn with the tool outputs the page produced', async () => {
    const execute = mock(async () => ({ matches: ['islands'] }));

    defineTool({ name: 'search_docs', description: 'Search', inputSchema: { type: 'object' }, execute });
    const llm = fakeStreamingLlm([
      {
        chunks: [
          { type: 'start' },
          { type: 'start-step' },
          { type: 'tool-input-start', toolCallId: 'c1', toolName: 'search_docs' },
          { type: 'tool-input-available', toolCallId: 'c1', toolName: 'search_docs', input: {} },
          { type: 'finish-step' },
          { type: 'finish' },
        ],
        reply: { toolCalls: [{ id: 'c1', name: 'search_docs', arguments: {} }] },
      },
      {
        chunks: [
          { type: 'start' },
          { type: 'start-step' },
          { type: 'text-start', id: 't0' },
          { type: 'text-delta', id: 't0', delta: 'Islands resume lazily.' },
          { type: 'text-end', id: 't0' },
          { type: 'finish-step' },
          { type: 'finish' },
        ],
        reply: { text: 'Islands resume lazily.' },
      },
    ]);
    const chunks = await collect(createCopilot({ llm, manifestTools: false }).stream('what are islands?'));

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start',
      'start-step',
      'tool-input-start',
      'tool-input-available',
      'tool-output-available',
      'finish-step',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(chunks.find((chunk) => chunk.type === 'tool-output-available')?.toolCallId).toBe('c1');
  });

  it('delivers the whole answer as chunks when the Llm cannot stream (local model)', async () => {
    const llm = async (): Promise<LlmResponse> => ({ text: 'whole answer' });
    const chunks = await collect(createCopilot({ llm, manifestTools: false }).stream('hi'));

    expect(chunks.map((chunk) => chunk.type)).toEqual(['start', 'text-start', 'text-delta', 'text-end', 'finish']);
    expect(chunks[2]!.delta).toBe('whole answer');
  });

  it('closes with an abort chunk when the caller stops the run', async () => {
    const controller = new AbortController();
    const llm = async (): Promise<LlmResponse> => {
      controller.abort();

      throw new DOMException('aborted', 'AbortError');
    };
    const chunks = await collect(createCopilot({ llm, manifestTools: false }).stream('hi', controller.signal));

    expect(chunks.map((chunk) => chunk.type)).toEqual(['start', 'abort']);
  });
});

describe('serverLlm({ stream: true })', () => {
  it('rebuilds the turn from the chunk stream and hands them to subscribers', async () => {
    const originalFetch = globalThis.fetch;
    const sse = [
      'data: {"type":"text-start","id":"t0"}\n\n',
      'data: {"type":"text-delta","id":"t0","delta":"He',
      'llo"}\n\ndata: {"type":"tool-input-available","toolCallId":"c1","toolName":"nav","input":{"path":"/x"}}\n\n',
      'data: [DONE]\n\n',
    ];

    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();

            sse.forEach((fragment) => controller.enqueue(encoder.encode(fragment)));
            controller.close();
          },
        }),
        { status: 200 },
      )) as any;
    const llm = serverLlm({ stream: true });
    const seen: any[] = [];

    llm.subscribe((chunk) => seen.push(chunk.type));
    const reply = await llm({ messages: [], tools: [] } as any);

    globalThis.fetch = originalFetch;

    expect(reply.text).toBe('Hello');
    expect(reply.toolCalls).toEqual([{ id: 'c1', name: 'nav', arguments: { path: '/x' } }]);
    expect(seen).toEqual(['text-start', 'text-delta', 'tool-input-available']);
  });

  it('surfaces the mount\'s own words when it refuses (setup card, rate limit)', async () => {
    const originalFetch = globalThis.fetch;
    const refusals = [
      { status: 503, body: { type: 'setup', message: 'No model configured. Set JANUX_MODEL="provider/model".' } },
      { status: 429, body: { type: 'error', error: 'rate_limited', message: 'Too many questions right now.' } },
    ];

    for (const { status, body } of refusals) {
      globalThis.fetch = (async () => Response.json(body, { status })) as any;

      await expect(serverLlm({ stream: true })({ messages: [], tools: [] } as any)).rejects.toThrow(body.message);
    }
    globalThis.fetch = originalFetch;
  });

  it('falls back to the status when a refusal carries no message', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => new Response('<html>502</html>', { status: 502 })) as any;

    await expect(serverLlm({ stream: true })({ messages: [], tools: [] } as any)).rejects.toThrow('502');
    globalThis.fetch = originalFetch;
  });

  it('surfaces an error chunk as a rejected turn', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response(`data: {"type":"error","errorText":"provider down"}\n\ndata: [DONE]\n\n`, { status: 200 })) as any;
    const llm = serverLlm({ stream: true });
    const failure = llm({ messages: [], tools: [] } as any);

    await expect(failure).rejects.toThrow('provider down');
    globalThis.fetch = originalFetch;
  });
});
