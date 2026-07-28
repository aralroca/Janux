import { describe, expect, it } from 'bun:test';
import { sendFetchResponse } from './request-adapter';

function fakeNodeResponse() {
  const decoder = new TextDecoder();
  const writes: string[] = [];
  let ended = false;

  return {
    writes,
    isEnded: () => ended,
    writeHead() {},
    once() {},
    write(chunk: Uint8Array) {
      writes.push(decoder.decode(chunk, { stream: true }));

      return true;
    },
    end() {
      ended = true;
    },
  };
}

describe('sendFetchResponse (streaming SSR through the dev server)', () => {
  it('writes chunks as they arrive instead of buffering the whole body', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first'));
        await gate;
        controller.enqueue(encoder.encode('second'));
        controller.close();
      },
    });
    const res = fakeNodeResponse();
    const sending = sendFetchResponse(res as any, new Response(body));

    await new Promise((resolve) => setTimeout(resolve));
    expect(res.writes.join('')).toBe('first');
    expect(res.isEnded()).toBe(false);

    release();
    await sending;
    expect(res.writes.join('')).toBe('firstsecond');
    expect(res.isEnded()).toBe(true);
  });

  it('ends the response when there is no body', async () => {
    const res = fakeNodeResponse();

    await sendFetchResponse(res as any, new Response(null, { status: 302, headers: { location: '/x' } }));

    expect(res.writes).toEqual([]);
    expect(res.isEnded()).toBe(true);
  });
});
