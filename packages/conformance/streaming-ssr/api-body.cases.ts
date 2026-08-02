import { api, createJanuxServer } from '@janux/server';
import { jsx, obj, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The one place the invocation surface reads a request body: `/_janux/api/*`,
 * `/_janux/approve` and `/_janux/reject`. A JSON call is small by construction
 * — a tool's input, or a proposal id — so an unbounded read there is a memory
 * ceiling an anonymous client gets to choose. `readBodyWithin` already existed
 * for exactly this and these endpoints were the ones not using it.
 *
 * The limit is deliberately generous (1 MiB): the point is that a ceiling
 * exists and is enforced BEFORE the bytes are buffered, not that it is tight.
 */

const LIMIT = 1024 * 1024;

let ran = 0;

const echo = api({
  description: 'Echoes its input',
  input: obj({ q: str() }),
  run: ({ input }) => {
    ran += 1;

    return input;
  },
});

const server = createJanuxServer({ routes: { '/': () => jsx('main', {}) }, apis: { shop: { echo } } });

const HEADERS = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://test' };

/** Posts a body whose length the request declares — the cheap refusal path. */
function post(path: string, body: string, extra: Record<string, string> = {}): Promise<Response> {
  return server.fetch(new Request(`http://test${path}`, { method: 'POST', body, headers: { ...HEADERS, ...extra } }));
}

/** Posts the same bytes with NO declared length, so only the read can stop it. */
function stream(path: string, size: number): Promise<Response> {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return controller.close();
      const chunk = new Uint8Array(64 * 1024).fill(120);

      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  return server.fetch(new Request(`http://test${path}`, { method: 'POST', body, headers: HEADERS, duplex: 'half' } as RequestInit));
}

const oversized = (): string => JSON.stringify({ q: 'x'.repeat(LIMIT + 1024) });

export const API_BODY_CASES: ScenarioCase[] = [
  {
    id: 'stream2-body-a-declared-oversize-api-call-is-refused-before-a-byte-is-buffered',
    src: 'janux',
    run: async (log) => {
      const before = ran;
      const response = await post('/_janux/api/shop.echo', oversized());

      log.push(`status=${response.status} ran=${ran - before}`);
    },
    expected: ['status=413 ran=0'],
  },
  {
    id: 'stream2-body-the-refusal-says-what-the-limit-was',
    src: 'janux',
    run: async (log) => {
      const body = (await (await post('/_janux/api/shop.echo', oversized())).json()) as { error: string };

      log.push(body.error);
    },
    expected: [`request body exceeds the ${LIMIT}-byte limit`],
  },
  {
    id: 'stream2-body-an-undeclared-oversize-api-call-is-cut-while-it-is-being-read',
    src: 'janux',
    run: async (log) => {
      const before = ran;
      const response = await stream('/_janux/api/shop.echo', LIMIT + 256 * 1024);

      log.push(`status=${response.status} ran=${ran - before}`);
    },
    expected: ['status=413 ran=0'],
  },
  {
    id: 'stream2-body-a-call-that-fits-under-the-ceiling-runs-exactly-as-before',
    src: 'janux',
    run: async (log) => {
      const response = await post('/_janux/api/shop.echo', JSON.stringify({ q: 'y'.repeat(1000) }));
      const body = (await response.json()) as { ok: boolean; result: { q: string } };

      log.push(`status=${response.status} ok=${body.ok} length=${body.result.q.length}`);
    },
    expected: ['status=200 ok=true length=1000'],
  },
  {
    id: 'stream2-body-a-body-right-under-the-ceiling-is-still-a-call',
    src: 'janux',
    run: async (log) => {
      const filler = 'z'.repeat(LIMIT - 64);
      const response = await post('/_janux/api/shop.echo', JSON.stringify({ q: filler }));

      log.push(`status=${response.status}`);
    },
    expected: ['status=200'],
  },
  {
    id: 'stream2-body-malformed-json-still-degrades-to-an-empty-input-rather-than-a-413',
    src: 'janux',
    run: async (log) => {
      const response = await post('/_janux/api/shop.echo', '{ not json');

      log.push(`status=${response.status} body=${await response.text()}`);
    },
    expected: ['status=400 body={"ok":false,"error":"Error: Invalid input for \\"shop.echo\\" — q: required"}'],
  },
  {
    id: 'stream2-body-an-empty-body-reaches-the-tool-as-an-empty-input',
    src: 'janux',
    run: async (log) => {
      const response = await server.fetch(new Request('http://test/_janux/api/shop.echo', { method: 'POST', headers: HEADERS }));

      log.push(`status=${response.status} body=${await response.text()}`);
    },
    expected: ['status=400 body={"ok":false,"error":"Error: Invalid input for \\"shop.echo\\" — q: required"}'],
  },
  {
    id: 'stream2-body-the-ceiling-applies-to-an-agent-origin-call-just-the-same',
    src: 'janux',
    run: async (log) => {
      const response = await post('/_janux/api/shop.echo', oversized(), { 'x-janux-origin': 'agent' });

      log.push(`status=${response.status}`);
    },
    expected: ['status=413'],
  },
  {
    id: 'stream2-body-an-unknown-tool-is-still-a-404-and-never-buffers-the-body',
    src: 'janux',
    run: async (log) => {
      const response = await post('/_janux/api/shop.absent', oversized());

      log.push(`status=${response.status}`);
    },
    expected: ['status=404'],
  },
  {
    id: 'stream2-body-settling-a-proposal-cannot-be-used-to-buffer-a-megabyte-either',
    src: 'janux',
    run: async (log) => {
      const approve = await post('/_janux/approve', oversized());
      const reject = await post('/_janux/reject', oversized());

      log.push(`approve=${approve.status} reject=${reject.status}`);
    },
    expected: ['approve=413 reject=413'],
  },
  {
    id: 'stream2-body-an-honest-proposal-settlement-still-answers-unknown-proposal',
    src: 'janux',
    run: async (log) => {
      const approve = await post('/_janux/approve', JSON.stringify({ id: 'nope' }));

      log.push(`status=${approve.status} body=${await approve.text()}`);
    },
    expected: ['status=404 body={"ok":false,"error":"unknown proposal"}'],
  },
  {
    id: 'stream2-body-a-rejected-oversize-call-answers-json-not-html',
    src: 'janux',
    run: async (log) => {
      const response = await post('/_janux/api/shop.echo', oversized());

      log.push(`type=${response.headers.get('content-type')}`);
    },
    expected: ['type=application/json;charset=utf-8'],
  },
];
