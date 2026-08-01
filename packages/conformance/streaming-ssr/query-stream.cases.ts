import { createJanuxServer } from '@janux/server';
import { component, jsx, source } from 'janux';
import { useQuery } from 'janux/client';
import type { ScenarioCase } from '../support/scenario';
import { after, ordered, readRest, readUntil } from './harness';

/**
 * Query hydration as a *streaming* concern: a page's data payload has to be
 * split across the chunks the response already sent, because the browser is
 * reading them as they land. What SSR resolved before the shell went out
 * travels with the shell; what it had not resolved yet is announced so an
 * observer waits for this response instead of starting the same request again;
 * and the tail carries only what the earlier chunks could not.
 *
 * `janux-server`'s `query-hydration.test.ts` owns the single-payload shape.
 * These rows own what happens when there is more than one moment to ship in.
 */

/** An island that runs one query — the only thing SSR needs to fill the payload. */
const querying = (name: string, key: string, ms: number, data: unknown[] = [`${key}-1`]) =>
  component({
    name,
    view: (bag: any) => {
      const query = useQuery(bag, key, () => ({ queryKey: [key], queryFn: () => after(ms, data) }));

      return jsx('p', { children: `${key}:${(query.data.value ?? []).length}` });
    },
  });

/** A boundary, so the response has an interlude to split the payload across. */
const boundary = component({
  name: 'q-boundary',
  sources: { rows: source({ query: () => after(25, ['a']) }) },
  suspense: () => jsx('p', { children: 'loading' }),
  view: () => jsx('p', { children: 'rows' }),
});

const server = createJanuxServer({
  title: 'Queries',
  routes: {
    '/none': () => jsx('main', { children: 'nothing' }),
    '/resolved': () => jsx('main', { children: jsx(querying('q-fast', 'fast', 0) as any, {}) }),
    '/split': () =>
      jsx('main', {
        children: [jsx(querying('q-early', 'early', 0) as any, {}), jsx(querying('q-late', 'late', 45) as any, {}), jsx(boundary as any, {})],
      }),
    '/shared': () =>
      jsx('main', { children: [jsx(querying('q-one', 'shared', 0) as any, {}), jsx(querying('q-two', 'shared', 0) as any, {})] }),
    '/hostile': () => jsx('main', { children: jsx(querying('q-hostile', 'hostile', 0, ['</script><img onerror=alert(1)>']) as any, {}) }),
    '/boom': () => {
      throw new Error('query page boom');
    },
  },
  runtimeUrl: '/runtime.js',
  islandModules: { 'q-fast': '/a.js', 'q-early': '/b.js', 'q-late': '/c.js', 'q-boundary': '/d.js', 'q-one': '/e.js', 'q-two': '/f.js', 'q-hostile': '/g.js' },
});

const get = (path: string) => server.fetch(new Request(`http://test${path}`));
const text = async (path: string): Promise<string> => (await get(path)).text();

/** Every `__JANUX_QUERY__` payload the document pushed, in order. */
const payloads = (html: string): Array<{ entries: Record<string, { data: unknown }>; expect: string[] }> =>
  [...html.matchAll(/__JANUX_QUERY__\|\|\[\]\)\.push\((.*?)\);document/gs)].map((match) => JSON.parse(match[1]!));

export const QUERY_STREAM_CASES: ScenarioCase[] = [
  {
    id: 'stream2-q-a-page-that-runs-no-query-pays-not-one-byte-for-the-mechanism',
    src: 'janux',
    run: async (log) => {
      const html = await text('/none');

      log.push(`payload=${html.includes('__JANUX_QUERY__')}`);
    },
    expected: ['payload=false'],
  },
  {
    id: 'stream2-q-what-ssr-resolved-travels-with-the-document-that-rendered-it',
    src: 'janux',
    run: async (log) => {
      const [payload, ...rest] = payloads(await text('/resolved'));

      log.push(`chunks=${rest.length + 1}`);
      log.push(`data=${JSON.stringify(payload!.entries['["fast"]']!.data)} expect=${JSON.stringify(payload!.expect)}`);
    },
    expected: ['chunks=1', 'data=["fast-1"] expect=[]'],
  },
  {
    id: 'stream2-q-the-payload-script-removes-itself-so-a-navigation-re-runs-it',
    src: 'janux',
    run: async (log) => {
      const html = await text('/resolved');

      log.push(`self-removing=${html.includes('document.currentScript.remove()')}`);
      log.push(`keyed=${html.includes('<script key="jx-query:1">')}`);
    },
    expected: ['self-removing=true', 'keyed=true'],
  },
  {
    id: 'stream2-q-the-payload-follows-the-state-snapshots-and-precedes-the-runtime',
    src: 'janux',
    run: async (log) => {
      const html = await text('/resolved');

      log.push(ordered(html, '__JANUX_QUERY__', 'type="speculationrules"'));
      log.push(ordered(html, '__JANUX_QUERY__', 'key="jx-runtime"'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-q-a-query-still-in-flight-when-the-shell-goes-out-is-announced-not-repeated',
    src: 'janux',
    run: async (log) => {
      const { received, reader } = await readUntil(await get('/split'), 'id="jx-runtime-eager"');
      const [interlude] = payloads(received);

      log.push(`entries=${Object.keys(interlude!.entries).length}`);
      log.push(`expect=${interlude!.expect.sort().join(',')}`);
      await readRest(reader);
    },
    expected: ['entries=0', 'expect=["early"],["late"]'],
  },
  {
    id: 'stream2-q-the-tail-delivers-what-the-interlude-could-only-announce',
    src: 'janux',
    run: async (log) => {
      const { received, reader } = await readUntil(await get('/split'), 'id="jx-runtime-eager"');
      const [tail] = payloads(await readRest(reader));

      log.push(`interlude-entries=${Object.keys(payloads(received)[0]!.entries).length}`);
      log.push(`tail=${Object.keys(tail!.entries).sort().join(',')}`);
      log.push(`tail-expect=${JSON.stringify(tail!.expect)}`);
    },
    expected: ['interlude-entries=0', 'tail=["early"],["late"]', 'tail-expect=[]'],
  },
  {
    id: 'stream2-q-a-query-that-only-resolved-after-the-interlude-still-reaches-the-page',
    src: 'janux',
    run: async (log) => {
      const [, tail] = payloads(await text('/split'));

      log.push(`late=${JSON.stringify(tail!.entries['["late"]']!.data)}`);
    },
    expected: ['late=["late-1"]'],
  },
  {
    id: 'stream2-q-no-entry-is-ever-sent-twice-across-the-chunks-of-one-response',
    src: 'janux',
    run: async (log) => {
      const all = payloads(await text('/split')).flatMap((payload) => Object.keys(payload.entries));

      log.push(`sent=${all.sort().join(',')} unique=${new Set(all).size === all.length}`);
    },
    expected: ['sent=["early"],["late"] unique=true'],
  },
  {
    id: 'stream2-q-each-payload-chunk-is-keyed-apart-so-the-navigation-diff-runs-both',
    src: 'janux',
    run: async (log) => {
      const keys = [...(await text('/split')).matchAll(/key="(jx-query:\d+)"/g)].map((match) => match[1]);

      log.push(`keys=${keys.join(',')} distinct=${new Set(keys).size === keys.length}`);
    },
    expected: ['keys=jx-query:0,jx-query:2 distinct=true'],
  },
  {
    id: 'stream2-q-the-announcement-rides-the-interlude-and-not-a-chunk-of-its-own',
    src: 'janux',
    run: async (log) => {
      const html = await text('/split');

      log.push(ordered(html, '</main>', '__JANUX_QUERY__'));
      log.push(ordered(html, '__JANUX_QUERY__', 'id="jx-runtime-eager"'));
      log.push(ordered(html, 'id="jx-runtime-eager"', '<template id="jxu:q-boundary#default"'));
    },
    expected: ['ordered', 'ordered', 'ordered'],
  },
  {
    id: 'stream2-q-the-tail-payload-lands-after-the-boundary-chunks-it-was-waiting-for',
    src: 'janux',
    run: async (log) => {
      const html = await text('/split');

      log.push(ordered(html, 'key="jxq:q-boundary#default"', 'key="jx-query:2"'));
      log.push(ordered(html, 'key="jx-query:2"', '</body>'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-q-two-islands-observing-one-key-hydrate-from-a-single-entry',
    src: 'janux',
    run: async (log) => {
      const all = payloads(await text('/shared'));

      log.push(`chunks=${all.length} entries=${Object.keys(all[0]!.entries).join(',')}`);
    },
    expected: ['chunks=1 entries=["shared"]'],
  },
  {
    id: 'stream2-q-a-payload-that-tries-to-close-the-script-tag-cannot',
    src: 'janux',
    run: async (log) => {
      const html = await text('/hostile');

      log.push(`broken-out=${html.includes('</script><img')}`);
      log.push(`escaped=${html.includes('\\u003c/script>')}`);
      log.push(`round-trips=${payloads(html)[0]!.entries['["hostile"]']!.data as any}`);
    },
    expected: ['broken-out=false', 'escaped=true', 'round-trips=</script><img onerror=alert(1)>'],
  },
  {
    id: 'stream2-q-an-error-page-has-no-queries-and-so-ships-no-payload',
    src: 'janux',
    run: async (log) => {
      const response = await get('/boom');
      const html = await response.text();

      log.push(`status=${response.status} payload=${html.includes('__JANUX_QUERY__')}`);
    },
    expected: ['status=500 payload=false'],
  },
  {
    id: 'stream2-q-the-query-client-is-per-request-so-two-responses-carry-their-own-data',
    src: 'janux',
    run: async (log) => {
      const [left, right] = await Promise.all([text('/resolved'), text('/resolved')]);

      log.push(`both=${payloads(left).length === 1 && payloads(right).length === 1}`);
      log.push(`same-data=${JSON.stringify(payloads(left)[0]!.entries['["fast"]']!.data) === JSON.stringify(payloads(right)[0]!.entries['["fast"]']!.data)}`);
    },
    expected: ['both=true', 'same-data=true'],
  },
  {
    id: 'stream2-q-the-response-waits-for-a-pending-query-instead-of-closing-without-it',
    src: 'janux',
    run: async (log) => {
      const started = performance.now();
      const html = await text('/split');

      // `late` needs 45ms and only starts once the island renders: the tail
      // cannot have been written before it settled.
      log.push(`waited=${performance.now() - started >= 45}`);
      log.push(`delivered=${html.includes('late-1')}`);
    },
    expected: ['waited=true', 'delivered=true'],
  },
  {
    id: 'stream2-q-the-markdown-projection-carries-no-payload-script-and-no-island-markup',
    src: 'janux',
    run: async (log) => {
      const markdown = await text('/resolved.md');

      log.push(`scripts=${markdown.includes('__JANUX_QUERY__')} hosts=${markdown.includes('janux-island')}`);
      // The buffered render does NOT block on the page's queries — the data
      // ships to the CLIENT in the payload, and the projection has no client.
      // So an agent reads the pre-query render: `fast:0`, not `fast:1`.
      log.push(`prose=${markdown.trim().endsWith('fast:0')}`);
    },
    expected: ['scripts=false hosts=false', 'prose=true'],
  },
  {
    id: 'stream2-q-the-announcement-names-the-hash-the-client-computes-not-the-key-object',
    src: 'janux',
    run: async (log) => {
      const { received, reader } = await readUntil(await get('/split'), 'id="jx-runtime-eager"');

      log.push(`hashes=${payloads(received)[0]!.expect.every((hash) => hash.startsWith('[') && hash.endsWith(']'))}`);
      await readRest(reader);
    },
    expected: ['hashes=true'],
  },
  {
    id: 'stream2-q-a-page-whose-queries-all-resolved-announces-nothing-to-wait-for',
    src: 'janux',
    run: async (log) => {
      log.push(`expect=${JSON.stringify(payloads(await text('/resolved'))[0]!.expect)}`);
      log.push(`shared-expect=${JSON.stringify(payloads(await text('/shared'))[0]!.expect)}`);
    },
    expected: ['expect=[]', 'shared-expect=[]'],
  },
  {
    id: 'stream2-q-the-entry-carries-the-status-the-client-needs-to-skip-refetching',
    src: 'janux',
    run: async (log) => {
      const entry = payloads(await text('/resolved'))[0]!.entries['["fast"]'] as unknown as { status: string; isFetching: boolean };

      log.push(`status=${entry.status} fetching=${entry.isFetching}`);
    },
    expected: ['status=success fetching=false'],
  },
];
