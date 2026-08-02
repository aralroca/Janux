import { createJanuxServer } from '@janux/server';
import { component, jsx, source } from 'janux';
import type { ScenarioCase } from '../support/scenario';
import { after, readRest, readUntil, responseChunks } from './harness';

/**
 * The response as a *stream*, not as a string: it is pulled, so a reader that
 * takes its time gets the same document a reader that drains it in one go does,
 * and one that walks away takes the renderer with it.
 *
 * The bytes are pinned by joining, never by chunk: the encoder is free to cut
 * wherever it likes as long as the document, the UTF-8 and the ordering survive.
 */

const big = component({
  name: 'bp-big',
  sources: { rows: source({ query: () => after(5, [...Array(2000).keys()].map(String)) }) },
  view: ({ sources }: any) => jsx('ul', { children: (sources.rows.value as string[]).map((row) => jsx('li', { children: row })) }),
});

const suspended = component({
  name: 'bp-suspended',
  sources: { rows: source({ query: () => after(25, ['a']) }) },
  suspense: () => jsx('p', { children: 'loading' }),
  view: () => jsx('p', { children: 'ready' }),
});

const stuck = component({
  name: 'bp-stuck',
  sources: { rows: source({ query: () => new Promise<string[]>(() => undefined) }) },
  suspense: () => jsx('p', { children: 'stuck' }),
  view: () => jsx('p', { children: 'never' }),
});

const server = createJanuxServer({
  title: 'Backpressure',
  routes: {
    '/big': () => jsx('main', { children: jsx(big as any, {}) }),
    '/unicode': () => jsx('main', { children: ['日本語のテキスト', '🚀🛰️', 'ñandú', 'é'] }),
    '/suspended': () => jsx('main', { children: [jsx('h1', { children: 'shell' }), jsx(suspended as any, {})] }),
    '/stuck': () => jsx('main', { children: [jsx('h1', { children: 'shell' }), jsx(stuck as any, {})] }),
  },
  runtimeUrl: '/runtime.js',
  islandModules: { 'bp-big': '/a.js', 'bp-suspended': '/b.js', 'bp-stuck': '/c.js' },
});

const get = (path: string) => server.fetch(new Request(`http://test${path}`));

export const BACKPRESSURE_CASES: ScenarioCase[] = [
  {
    id: 'stream2-bp-the-body-is-a-readable-stream-and-not-a-buffered-string',
    src: 'janux',
    run: async (log) => {
      const response = await get('/big');

      log.push(`stream=${response.body instanceof ReadableStream} locked=${response.bodyUsed}`);
      await response.text();
    },
    expected: ['stream=true locked=false'],
  },
  {
    id: 'stream2-bp-reading-one-chunk-does-not-drain-the-rest-of-the-document',
    src: 'janux',
    run: async (log) => {
      const response = await get('/big');
      const reader = response.body!.getReader();
      const first = await reader.read();
      const second = await reader.read();

      log.push(`first=${!first.done} second=${!second.done}`);
      log.push(`head-only=${!new TextDecoder().decode(first.value).includes('</html>')}`);
      await reader.cancel();
    },
    expected: ['first=true second=true', 'head-only=true'],
  },
  {
    id: 'stream2-bp-a-reader-that-pauses-between-reads-still-gets-the-whole-document',
    src: 'janux',
    run: async (log) => {
      const eager = await (await get('/suspended')).text();
      const response = await get('/suspended');
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let slow = '';

      for (let part = await reader.read(); !part.done; part = await reader.read()) {
        slow += decoder.decode(part.value, { stream: true });
        await new Promise((resolve) => setTimeout(resolve, 3));
      }
      log.push(`identical=${slow === eager}`);
      log.push(`complete=${slow.includes('<p>ready</p>') && slow.trimEnd().endsWith('</html>')}`);
    },
    expected: ['identical=true', 'complete=true'],
  },
  {
    id: 'stream2-bp-the-joined-chunks-are-exactly-what-text-would-have-returned',
    src: 'janux',
    run: async (log) => {
      const chunks = await responseChunks(await get('/big'));
      const whole = await (await get('/big')).text();

      log.push(`identical=${chunks.join('') === whole}`);
      log.push(`chunked=${chunks.length > 1}`);
    },
    expected: ['identical=true', 'chunked=true'],
  },
  {
    id: 'stream2-bp-the-stream-reports-done-once-and-stays-done',
    src: 'janux',
    run: async (log) => {
      const reader = (await get('/unicode')).body!.getReader();

      while (!(await reader.read()).done) continue;
      const after1 = await reader.read();
      const after2 = await reader.read();

      log.push(`done=${after1.done && after2.done} value=${String(after1.value)}`);
    },
    expected: ['done=true value=undefined'],
  },
  {
    id: 'stream2-bp-multibyte-text-survives-the-chunked-encoder-intact',
    src: 'janux',
    run: async (log) => {
      const html = await (await get('/unicode')).text();

      log.push(`japanese=${html.includes('日本語のテキスト')} emoji=${html.includes('🚀🛰️')}`);
      log.push(`combining=${html.includes('ñandúé')}`);
      log.push(`replacement=${html.includes('�')}`);
    },
    expected: ['japanese=true emoji=true', 'combining=true', 'replacement=false'],
  },
  {
    id: 'stream2-bp-the-document-survives-a-decoder-stream-in-the-middle',
    src: 'janux',
    run: async (log) => {
      const direct = await (await get('/unicode')).text();
      const piped = (await get('/unicode')).body!.pipeThrough(new TextDecoderStream());
      let joined = '';

      for await (const chunk of piped as unknown as AsyncIterable<string>) joined += chunk;
      log.push(`identical=${joined === direct}`);
    },
    expected: ['identical=true'],
  },
  {
    id: 'stream2-bp-a-large-page-arrives-complete-however-it-was-cut',
    src: 'janux',
    run: async (log) => {
      const html = await (await get('/big')).text();

      log.push(`rows=${(html.match(/<li>/g) ?? []).length}`);
      log.push(`closed=${html.trimEnd().endsWith('</html>')}`);
    },
    expected: ['rows=2000', 'closed=true'],
  },
  {
    id: 'stream2-bp-releasing-and-re-acquiring-the-reader-resumes-where-it-stopped',
    src: 'janux',
    run: async (log) => {
      const response = await get('/big');
      const first = response.body!.getReader();
      const head = await first.read();

      first.releaseLock();
      const second = response.body!.getReader();
      const next = await second.read();

      log.push(`head=${new TextDecoder().decode(head.value).startsWith('<!doctype html>')}`);
      log.push(`resumed=${!next.done && !new TextDecoder().decode(next.value).startsWith('<!doctype')}`);
      await second.cancel();
    },
    expected: ['head=true', 'resumed=true'],
  },
  {
    id: 'stream2-bp-a-page-whose-boundary-never-settles-never-closes-its-document',
    src: 'janux',
    run: async (log) => {
      const response = await get('/stuck');
      const { received, reader } = await readUntil(response, 'id="jx-runtime-eager"');
      const raced = await Promise.race([
        reader.read().then(() => 'more'),
        new Promise((resolve) => setTimeout(() => resolve('still-waiting'), 30)),
      ]);

      log.push(`shell=${received.includes('<p>stuck</p>')} open=${!received.includes('</html>')}`);
      log.push(`state=${raced}`);
      await reader.cancel();
    },
    expected: ['shell=true open=true', 'state=still-waiting'],
  },
  {
    id: 'stream2-bp-cancelling-after-the-interlude-drops-the-boundary-chunks',
    src: 'janux',
    run: async (log) => {
      const response = await get('/suspended');
      const { received, reader } = await readUntil(response, 'id="jx-runtime-eager"');

      await reader.cancel();
      log.push(`interactive=${received.includes('/runtime.js')} boundary=${received.includes('<template id="jxu:bp-suspended#default"')}`);
    },
    expected: ['interactive=true boundary=false'],
  },
  {
    id: 'stream2-bp-cancelling-one-response-does-not-disturb-a-concurrent-one',
    src: 'janux',
    run: async (log) => {
      const abandoned = await get('/suspended');
      const kept = get('/suspended');
      const reader = abandoned.body!.getReader();

      await reader.read();
      await reader.cancel();
      const html = await (await kept).text();

      log.push(`complete=${html.includes('<p>ready</p>') && html.trimEnd().endsWith('</html>')}`);
    },
    expected: ['complete=true'],
  },
  {
    id: 'stream2-bp-reading-only-the-head-and-then-the-rest-yields-one-document',
    src: 'janux',
    run: async (log) => {
      const whole = await (await get('/suspended')).text();
      const { received, reader } = await readUntil(await get('/suspended'), '<body>');
      const rest = await readRest(reader);

      log.push(`identical=${received + rest === whole}`);
    },
    expected: ['identical=true'],
  },
  {
    id: 'stream2-bp-a-cancelled-body-cannot-be-read-again',
    src: 'janux',
    run: async (log) => {
      const response = await get('/big');
      const reader = response.body!.getReader();

      await reader.read();
      await reader.cancel();
      const after1 = await reader.read();

      log.push(`done=${after1.done}`);
      log.push(`used=${response.bodyUsed}`);
    },
    expected: ['done=true', 'used=true'],
  },
];
