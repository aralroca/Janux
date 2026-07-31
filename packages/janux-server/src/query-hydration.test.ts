import { describe, expect, it } from 'bun:test';
import { component, jsx, source } from 'janux';
import { QueryClient } from 'janux/query';
import { useQuery } from 'janux/client';
import { queryPayloadScript } from './html-shell';
import { createJanuxServer } from './server';

/**
 * The server half of query hydration: what SSR already fetched travels in the
 * response, and what it has not fetched *yet* is announced so the client waits
 * for the stream instead of starting the same request again.
 */
/** The payload the client would receive, read back out of the emitted script. */
function payloadOf(script: string): { entries: Record<string, unknown>; expect: string[] } {
  return JSON.parse(/\.push\((.*)\);document/s.exec(script)![1]!);
}

describe('queryPayloadScript()', () => {
  it('emits nothing when the page ran no queries — a page without data costs no payload', () => {
    expect(queryPayloadScript(new QueryClient(), new Set())).toBe('');
  });

  it('emits nothing for a page that never built a client — an error page has no queries', () => {
    expect(queryPayloadScript(undefined, new Set())).toBe('');
  });

  it('carries what SSR resolved', async () => {
    const client = new QueryClient();

    await client.getQuery({ queryKey: ['products'], queryFn: async () => [{ id: 'p1' }] }).fetch();
    const script = queryPayloadScript(client, new Set());

    expect(script).toContain('__JANUX_QUERY__');
    expect(script).toContain('p1');
    // Self-removing, like the suspense call scripts: the navigation diff
    // re-executes an inserted script but would morph one already in place.
    expect(script).toContain('.remove()');
  });

  it('announces a query still in flight so the client does not restart it', () => {
    const client = new QueryClient();

    client.getQuery({ queryKey: ['slow'], queryFn: () => new Promise(() => {}) }).fetch().catch(() => undefined);
    const payload = payloadOf(queryPayloadScript(client, new Set()));

    expect(payload.expect).toEqual(['["slow"]']);
    expect(payload.entries).toEqual({});
  });

  it('does not repeat an entry the interlude already sent', async () => {
    const client = new QueryClient();

    await client.getQuery({ queryKey: ['products'], queryFn: async () => ['a'] }).fetch();
    const sent = new Set<string>();

    expect(queryPayloadScript(client, sent)).toContain('products');
    // The set is filled by the emitter, so the tail knows what is left to say.
    expect(sent.has('["products"]')).toBe(true);
    expect(queryPayloadScript(client, sent)).toBe('');
  });

  it('escapes a payload that tries to close the script tag', async () => {
    const client = new QueryClient();

    await client.getQuery({ queryKey: ['x'], queryFn: async () => ['</script><img onerror=alert(1)>'] }).fetch();

    expect(queryPayloadScript(client, new Set())).not.toContain('</script><img');
  });
});


/** Reads a streamed response up to a marker, leaving the rest for later. */
async function readUntil(res: Response, marker: string) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let received = '';

  while (!received.includes(marker)) {
    const { value, done } = await reader.read();

    if (done) break;
    received += decoder.decode(value, { stream: true });
  }

  return { received, reader };
}

async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let rest = '';

  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    rest += decoder.decode(part.value, { stream: true });
  }

  return rest;
}

const pushedChunks = (html: string) =>
  [...html.matchAll(/__JANUX_QUERY__\|\|\[\]\)\.push\((.*?)\);document/gs)].map((match) => JSON.parse(match[1]!));

/**
 * A page whose suspense boundary is still pending ships its shell early — and
 * a query that has not resolved by then must be announced in that chunk and
 * delivered in a later one, rather than left for the browser to start again.
 */
describe('a query still in flight when the shell goes out', () => {
  it('is announced in the interlude and delivered in the tail', async () => {
    let releaseRows!: (rows: string[]) => void;
    let releaseQuery!: (items: string[]) => void;
    const rowsGate = new Promise<string[]>((resolve) => { releaseRows = resolve; });
    const queryGate = new Promise<string[]>((resolve) => { releaseQuery = resolve; });

    const slow = component({
      name: 'slow',
      sources: { rows: source({ query: () => rowsGate }) },
      suspense: () => jsx('p', { children: 'loading' }),
      view: ({ sources }: any) => jsx('p', { children: `rows:${sources.rows.value.length}` }),
    });
    const querying = component({
      name: 'querying',
      view: (bag: any) => {
        const q = useQuery(bag, 'items', () => ({ queryKey: ['items'], queryFn: () => queryGate }));

        return jsx('p', { children: `items:${(q.data.value ?? []).length}` });
      },
    });
    const server = createJanuxServer({
      routes: { '/': () => jsx('main', { children: [jsx(querying as any, {}), jsx(slow as any, {})] }) },
      runtimeUrl: '/_janux/client.js',
      islandModules: { slow: '/islands/slow.js', querying: '/islands/querying.js' },
    });

    const response = await server.fetch(new Request('http://test/'));
    // Read only as far as the interlude: both the boundary and the query are
    // still pending at this point, which is the case under test.
    const { received, reader } = await readUntil(response, 'id="jx-runtime-eager"');
    const announced = pushedChunks(received);

    expect(announced.length).toBe(1);
    expect(announced[0].expect).toEqual(['["items"]']);
    expect(announced[0].entries).toEqual({});

    releaseRows(['r1']);
    releaseQuery(['a', 'b']);
    const delivered = pushedChunks(await readRest(reader));

    // The result arrives on the same response, so the client resolves the entry
    // it was already holding instead of starting the request over.
    expect(delivered.length).toBe(1);
    expect(delivered[0].entries['["items"]'].data).toEqual(['a', 'b']);
  });
});
