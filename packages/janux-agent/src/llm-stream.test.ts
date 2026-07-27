import { describe, expect, it } from 'bun:test';
import { defineAgent } from './agent';
import { streamingResponse, turnChunks } from './llm-stream';

const ENV = { OPENROUTER_API_KEY: 'test-key' };

/** An SSE body handed over in fragments that split lines and JSON payloads apart. */
function sseResponse(fragments: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      fragments.forEach((fragment) => controller.enqueue(encoder.encode(fragment)));
      controller.close();
    },
  });

  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function frames(...deltas: unknown[]): string[] {
  return [...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`), 'data: [DONE]\n\n'];
}

function streamRequest(body: unknown): Request {
  return new Request('http://localhost/_janux/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
}

async function chunksOf(response: Response): Promise<any[]> {
  const text = await response.text();

  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload));
}

const QUESTION = { messages: [{ role: 'user', content: 'hi' }], tools: [] };

describe('/_janux/llm streaming', () => {
  it('emits the UI message stream vocabulary in protocol order', async () => {
    const fetchImpl = async () => sseResponse(frames({ content: 'Hel' }, { content: 'lo' }));
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const response = await mount.handleLlm!(streamRequest(QUESTION));
    const chunks = await chunksOf(response);

    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('x-janux-stream-id')).toBeTruthy();
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta)).toEqual(['Hel', 'lo']);
  });

  it('terminates the body with the [DONE] sentinel and numbers every event', async () => {
    const fetchImpl = async () => sseResponse(frames({ content: 'ok' }));
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const body = await (await mount.handleLlm!(streamRequest(QUESTION))).text();

    expect(body.endsWith('data: [DONE]\n\n')).toBe(true);
    expect(body).toContain('id: 0\ndata: {"type":"start"}');
  });

  it('assembles tool calls whose arguments arrive as fragments across frames', async () => {
    const fetchImpl = async () =>
      sseResponse(
        frames(
          { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search_docs', arguments: '' } }] },
          { tool_calls: [{ index: 0, function: { arguments: '{"que' } }] },
          { tool_calls: [{ index: 0, function: { arguments: 'ry":"islands"}' } }] },
        ),
      );
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const chunks = await chunksOf(await mount.handleLlm!(streamRequest(QUESTION)));
    const available = chunks.find((chunk) => chunk.type === 'tool-input-available');

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start',
      'start-step',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-delta',
      'tool-input-available',
      'finish-step',
      'finish',
    ]);
    expect(available).toEqual({
      type: 'tool-input-available',
      toolCallId: 'call_1',
      toolName: 'search_docs',
      input: { query: 'islands' },
    });
  });

  it('survives an SSE body cut at arbitrary byte boundaries', async () => {
    const whole = frames({ content: 'streamed' }).join('');
    const fetchImpl = async () => sseResponse([whole.slice(0, 17), whole.slice(17, 40), whole.slice(40)]);
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const chunks = await chunksOf(await mount.handleLlm!(streamRequest(QUESTION)));

    expect(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta)).toEqual(['streamed']);
  });

  it('reports a provider failure as an error chunk instead of a dangling stream', async () => {
    const fetchImpl = async () => new Response('upstream exploded', { status: 500 });
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const body = await (await mount.handleLlm!(streamRequest(QUESTION))).text();

    expect(body).toContain('"type":"error"');
    expect(body).toContain('upstream exploded');
    expect(body.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('keeps the wire uniform for a provider that cannot stream (whole turn, same chunks)', async () => {
    const fetchImpl = async () => Response.json({ content: [{ type: 'text', text: 'one shot' }] });
    const mount = defineAgent({}, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
    const response = await mount.handleLlm!(streamRequest(QUESTION));
    const chunks = await chunksOf(response);

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(chunks.find((chunk) => chunk.type === 'text-delta')?.delta).toBe('one shot');
  });

  it('releases the provider body when the turn ends', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();

        frames({ content: 'done' }).forEach((fragment) => controller.enqueue(encoder.encode(fragment)));
        // Left open on purpose: a keep-alive socket the reader has to let go of.
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = async () => new Response(body, { status: 200 });
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });

    await chunksOf(await mount.handleLlm!(streamRequest(QUESTION)));

    expect(cancelled).toBe(true);
  });

  it('stops the provider turn when the reader walks away', async () => {
    let closed = false;
    async function* neverEnding(): AsyncGenerator<any, any> {
      try {
        while (true) yield { type: 'text', delta: 'tick' };
      } finally {
        closed = true;
      }
    }
    const response = streamingResponse(turnChunks(neverEnding()), 'sid');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let seen = '';

    // Read past the envelope, so the provider turn is actually running.
    while (!seen.includes('text-delta')) seen += decoder.decode((await reader.read()).value);
    await reader.cancel();
    await Bun.sleep(5);

    expect(closed).toBe(true);
  });

  it('keeps two parallel tool calls apart even when the provider omits the index', async () => {
    const fetchImpl = async () =>
      sseResponse(
        frames(
          { tool_calls: [{ id: 'c1', function: { name: 'first', arguments: '{"x":1}' } }] },
          { tool_calls: [{ id: 'c2', function: { name: 'second', arguments: '{"y":2}' } }] },
        ),
      );
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const chunks = await chunksOf(await mount.handleLlm!(streamRequest(QUESTION)));
    const available = chunks.filter((chunk) => chunk.type === 'tool-input-available');

    expect(available.map((chunk) => [chunk.toolName, chunk.input])).toEqual([
      ['first', { x: 1 }],
      ['second', { y: 2 }],
    ]);
  });

  it('never lets modelOptions take over the transport', async () => {
    let sent: any;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);

      return Response.json({ choices: [{ message: { content: 'ok' } }] });
    };
    const mount = defineAgent(
      { model: 'openrouter/x/y', modelOptions: { stream: true } },
      { env: ENV, fetchImpl },
    );
    const response = await mount.handleLlm!(
      new Request('http://localhost/_janux/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(QUESTION),
      }),
    );

    expect(sent.stream).toBeUndefined();
    expect(((await response.json()) as any).text).toBe('ok');
  });

  it('answers 405 to a GET instead of buying an empty turn', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;

      return sseResponse(frames({ content: 'x' }));
    };
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const response = await mount.handleLlm!(
      new Request('http://localhost/_janux/llm', { headers: { accept: 'text/event-stream' } }),
    );

    expect(response.status).toBe(405);
    expect(called).toBe(false);
  });

  it('rejects a resume attempt instead of replaying the turn', async () => {
    const fetchImpl = async () => sseResponse(frames({ content: 'ok' }));
    const mount = defineAgent({ model: 'openrouter/x/y' }, { env: ENV, fetchImpl });
    const request = new Request('http://localhost/_janux/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'last-event-id': '3' },
      body: JSON.stringify(QUESTION),
    });
    const response = await mount.handleLlm!(request);

    expect(response.status).toBe(422);
    expect(((await response.json()) as any).error).toBe('stream_not_resumable');
  });
});
