import { createJanuxServer, NAVIGATION_HEADER } from '@janux/server';
import { jsx } from 'janux';
import { setOnError, type ErrorInfo } from 'janux/observability';
import type { ScenarioCase } from '../support/scenario';
import { ordered, readRest, readUntil, responseChunks } from './harness';

/**
 * The document a streamed response actually is: prelude, page, interlude,
 * boundary chunks, tail — and what happens to the status line when the render
 * fails on either side of the first byte.
 *
 * The shape of the head and the *contents* of the shell are pinned by
 * `janux-server`'s own html-shell tests; what this file owns is the streaming
 * question those cannot ask: what has already reached the wire at each moment,
 * and what the response can still change once it has.
 */

const APP = `${import.meta.dirname}/__fixtures__/app`;

const app = createJanuxServer({
  title: 'Fixture',
  routesDir: APP,
  runtimeUrl: '/runtime.js',
  islandModules: { 'slow-list': '/islands/slow.js', 'stuck-list': '/islands/stuck.js', unmounted: '/islands/unmounted.js' },
  stylesheets: ['/app.css'],
  fontPreloads: ['/inter.woff2'],
  favicon: '/icon.svg',
});

/** The same app without `_404`/`_500` files: inline routes have no error pages. */
const bare = createJanuxServer({
  title: 'Bare',
  routes: {
    '/': () => jsx('main', { children: 'bare' }),
    '/boom': () => {
      throw new Error('bare boom');
    },
  },
});

const get = (path: string, headers?: Record<string, string>) => app.fetch(new Request(`http://test${path}`, { headers }));

/** Everything the response carries, joined — the document as a reader ends up with it. */
const text = async (path: string, headers?: Record<string, string>): Promise<string> => (await get(path, headers)).text();

/** Records what the app's global error sink was told, and always unregisters. */
async function withErrorSink(body: () => Promise<void>): Promise<Array<{ error: string; info: ErrorInfo }>> {
  const seen: Array<{ error: string; info: ErrorInfo }> = [];

  setOnError((error, info) => seen.push({ error: String(error), info }));
  try {
    await body();
  } finally {
    setOnError(undefined);
  }

  return seen;
}

export const DOCUMENT_CASES: ScenarioCase[] = [
  {
    id: 'stream2-doc-the-head-is-complete-on-the-wire-before-any-page-markup',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/'));

      log.push(`closed=${head!.includes('</head>')} body-open=${head!.trimEnd().endsWith('<body>')}`);
      log.push(`no-content=${!head!.includes('<h1>home</h1>')}`);
    },
    expected: ['closed=true body-open=true', 'no-content=true'],
  },
  {
    id: 'stream2-doc-the-prelude-orders-doctype-html-head-title-and-body',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/'));

      log.push(ordered(head!, '<!doctype html>', '<html lang="en">'));
      log.push(ordered(head!, '<html lang="en">', '<head>'));
      log.push(ordered(head!, '<head>', '<title>Streaming home</title>'));
      log.push(ordered(head!, '</head>', '<body>'));
    },
    expected: ['ordered', 'ordered', 'ordered', 'ordered'],
  },
  {
    id: 'stream2-doc-the-head-goes-out-long-before-the-island-it-is-waiting-for',
    src: 'janux',
    run: async (log) => {
      const response = await get('/slow');
      const reader = response.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);

      await reader.cancel();
      // Ordering, not a stopwatch: what the head raced was the island's source,
      // so the claim is that the first chunk is already the head and cannot yet
      // carry what that source resolves to. A wall-clock budget said the same
      // thing only on a machine fast enough to make it true.
      log.push(`head=${first.includes('<head')}`, `resolved=${first.includes('rows:')}`);
    },
    expected: ['head=true', 'resolved=false'],
  },
  {
    id: 'stream2-doc-the-routes-own-meta-reaches-the-head-not-the-tail',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/'));

      log.push(`title=${head!.includes('<title>Streaming home</title>')}`);
      log.push(`description=${head!.includes('content="A static page"')}`);
    },
    expected: ['title=true', 'description=true'],
  },
  {
    id: 'stream2-doc-a-page-without-a-description-omits-the-meta-entirely',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/slow'));

      log.push(`described=${head!.includes('id="jx-description"')}`);
    },
    expected: ['described=false'],
  },
  {
    id: 'stream2-doc-the-font-preload-precedes-the-stylesheet-it-exists-to-beat',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/'));

      log.push(ordered(head!, 'id="jx-font-0"', 'id="jx-style-0"'));
      log.push(`crossorigin=${head!.includes('as="font" type="font/woff2" crossorigin')}`);
    },
    expected: ['ordered', 'crossorigin=true'],
  },
  {
    id: 'stream2-doc-the-keyed-resource-links-sit-ahead-of-the-page-dependent-tags',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/'));

      log.push(ordered(head!, 'id="jx-favicon"', 'id="jx-style-0"'));
      log.push(ordered(head!, 'id="jx-style-0"', 'id="jx-description"'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-doc-the-manifest-link-names-the-path-the-request-asked-for',
    src: 'janux',
    run: async (log) => {
      const [head] = await responseChunks(await get('/slow'));

      log.push(`link=${head!.includes('href="/_janux/manifest?path=%2Fslow"')}`);
    },
    expected: ['link=true'],
  },
  {
    id: 'stream2-doc-a-page-with-no-islands-ships-no-runtime-and-no-state',
    src: 'janux',
    run: async (log) => {
      const html = await text('/');

      log.push(`runtime=${html.includes('/runtime.js')} state=${html.includes('application/janux+state')}`);
      log.push(`closed=${html.trimEnd().endsWith('</html>')}`);
    },
    expected: ['runtime=false state=false', 'closed=true'],
  },
  {
    id: 'stream2-doc-the-body-precedes-every-script-the-epilogue-adds',
    src: 'janux',
    run: async (log) => {
      const html = await text('/');

      log.push(ordered(html, '<p>static</p>', '<script type="speculationrules"'));
      log.push(ordered(html, '<script type="speculationrules"', '</body>'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-doc-a-suspended-page-becomes-interactive-before-its-boundaries-arrive',
    src: 'janux',
    run: async (log) => {
      const html = await text('/slow');

      log.push(ordered(html, '/runtime.js', '<template id="jxu:slow-list#default"'));
      log.push(ordered(html, 'id="jx-runtime-eager"', '<template id="jxu:slow-list#default"'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-doc-the-interlude-announces-island-modules-that-have-not-registered-yet',
    src: 'janux',
    run: async (log) => {
      const { received, reader } = await readUntil(await get('/slow'), 'id="jx-runtime-eager"');

      log.push(`declared=${received.includes('"unmounted":"/islands/unmounted.js"')}`);
      await readRest(reader);
    },
    expected: ['declared=true'],
  },
  {
    id: 'stream2-doc-a-boundary-islands-snapshot-rides-the-tail-not-the-interlude',
    src: 'janux',
    run: async (log) => {
      const { received, reader } = await readUntil(await get('/slow'), 'id="jx-runtime-eager"');
      const rest = await readRest(reader);

      log.push(`interlude=${received.includes('data-uri="ui://slow-list#default"')}`);
      log.push(`tail=${rest.includes('data-uri="ui://slow-list#default"')}`);
    },
    expected: ['interlude=false', 'tail=true'],
  },
  {
    id: 'stream2-doc-the-tail-of-an-interlude-page-repeats-nothing-the-interlude-said',
    src: 'janux',
    run: async (log) => {
      const html = await text('/slow');

      log.push(`speculation=${(html.match(/type="speculationrules"/g) ?? []).length}`);
      log.push(`islands-map=${(html.match(/window\.__JANUX_ISLANDS__/g) ?? []).length}`);
      log.push(`snapshots=${(html.match(/data-uri="ui:\/\/slow-list#default"/g) ?? []).length}`);
    },
    expected: ['speculation=1', 'islands-map=1', 'snapshots=1'],
  },
  {
    id: 'stream2-doc-the-boundary-chunks-land-inside-the-document-not-after-it',
    src: 'janux',
    run: async (log) => {
      const html = await text('/slow');

      log.push(ordered(html, '<template id="jxu:slow-list#default"', '</body>'));
      log.push(ordered(html, 'key="jxq:slow-list#default"', '</html>'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-doc-a-navigation-response-drops-the-bytes-the-open-document-already-has',
    src: 'janux',
    run: async (log) => {
      const fresh = await text('/');
      const navigated = await text('/', { [NAVIGATION_HEADER]: '1' });

      log.push(`fresh-fonts=${fresh.includes('id="jx-font-0"')} navigated-fonts=${navigated.includes('id="jx-font-0"')}`);
      log.push(`both-have-content=${fresh.includes('<h1>home</h1>') && navigated.includes('<h1>home</h1>')}`);
    },
    expected: ['fresh-fonts=true navigated-fonts=false', 'both-have-content=true'],
  },
  {
    id: 'stream2-doc-a-streamed-page-declares-html-with-an-explicit-charset',
    src: 'janux',
    run: async (log) => {
      const response = await get('/slow');

      log.push(response.headers.get('content-type') ?? 'none');
      await response.text();
    },
    expected: ['text/html; charset=utf-8'],
  },
  {
    id: 'stream2-doc-a-render-that-fails-before-the-first-byte-answers-500-with-the-error-page',
    src: 'janux',
    run: async (log) => {
      const response = await get('/boom');
      const html = await response.text();

      log.push(`status=${response.status}`);
      log.push(`page=${html.includes('<main class="broke">Broke: Error: page exploded</main>')}`);
    },
    expected: ['status=500', 'page=true'],
  },
  {
    id: 'stream2-doc-the-500-page-renders-on-its-own-because-the-layout-is-code-too',
    src: 'janux',
    run: async (log) => {
      const html = await text('/boom');

      log.push(`layout=${html.includes('<div class="shell">')}`);
    },
    expected: ['layout=false'],
  },
  {
    id: 'stream2-doc-the-404-page-renders-inside-the-apps-root-layout',
    src: 'janux',
    run: async (log) => {
      const html = await text('/nothing-here');

      log.push(`layout=${html.includes('<div class="shell"><main class="missing">')}`);
    },
    expected: ['layout=true'],
  },
  {
    id: 'stream2-doc-a-page-calling-not-found-answers-404-rather-than-a-200-apology',
    src: 'janux',
    run: async (log) => {
      const response = await get('/gone');
      const html = await response.text();

      log.push(`status=${response.status} page=${html.includes('No such page')}`);
    },
    expected: ['status=404 page=true'],
  },
  {
    id: 'stream2-doc-the-404-document-uses-its-own-title-not-the-apps',
    src: 'janux',
    run: async (log) => {
      const html = await text('/nothing-here');

      log.push(`title=${html.includes('<title>Nothing here</title>')}`);
    },
    expected: ['title=true'],
  },
  {
    id: 'stream2-doc-a-failure-after-the-first-byte-cannot-take-the-status-line-back',
    src: 'janux',
    run: async (log) => {
      const response = await get('/late-boom');
      const html = await response.text();

      log.push(`status=${response.status}`);
      log.push(`no-error-page=${!html.includes('class="broke"')}`);
    },
    expected: ['status=200', 'no-error-page=true'],
  },
  {
    id: 'stream2-doc-what-streamed-before-a-mid-stream-failure-stays-in-the-document',
    src: 'janux',
    run: async (log) => {
      const html = await text('/late-boom');

      log.push(`kept=${html.includes('<h1>flushed</h1>')} closed=${html.trimEnd().endsWith('</html>')}`);
    },
    expected: ['kept=true closed=true'],
  },
  {
    id: 'stream2-doc-a-mid-stream-failure-is-reported-in-page-on-the-janux-error-channel',
    src: 'janux',
    run: async (log) => {
      const html = await text('/late-boom');

      log.push(`event=${html.includes('new CustomEvent("janux:error"')}`);
      log.push(`keyed=${html.includes('key="jx-stream-error"')}`);
      log.push(`no-reload=${!html.includes('location.reload')}`);
    },
    expected: ['event=true', 'keyed=true', 'no-reload=true'],
  },
  {
    id: 'stream2-doc-a-mid-stream-failure-still-closes-body-and-html-for-the-parser',
    src: 'janux',
    run: async (log) => {
      const html = await text('/late-boom');

      log.push(ordered(html, 'key="jx-stream-error"', '</body>'));
      log.push(ordered(html, '</body>', '</html>'));
    },
    expected: ['ordered', 'ordered'],
  },
  {
    id: 'stream2-doc-a-failed-render-reaches-the-apps-error-sink-with-its-phase-and-route',
    src: 'janux',
    run: async (log) => {
      const seen = await withErrorSink(async () => {
        await text('/boom');
      });

      log.push(seen.map(({ error, info }) => `${info.phase} ${info.route} ${info.level} ${error}`).join(' | '));
    },
    expected: ['ssr /boom error Error: page exploded'],
  },
  {
    id: 'stream2-doc-a-404-is-not-an-incident-and-never-reaches-the-error-sink',
    src: 'janux',
    run: async (log) => {
      const seen = await withErrorSink(async () => {
        await text('/nothing-here');
        await text('/gone');
      });

      log.push(`reported=${seen.length}`);
    },
    expected: ['reported=0'],
  },
  {
    id: 'stream2-doc-an-app-with-no-error-page-degrades-to-the-status-line-alone',
    src: 'janux',
    run: async (log) => {
      const response = await bare.fetch(new Request('http://test/boom'));
      const seen = await withErrorSink(async () => {
        await bare.fetch(new Request('http://test/boom')).then((res) => res.text());
      });

      log.push(`status=${response.status} body=${await response.text()}`);
      log.push(`reported=${seen.length > 0}`);
    },
    expected: ['status=500 body=Internal Server Error', 'reported=true'],
  },
  {
    id: 'stream2-doc-an-app-with-no-404-page-answers-a-bare-not-found',
    src: 'janux',
    run: async (log) => {
      const response = await bare.fetch(new Request('http://test/absent'));

      log.push(`status=${response.status} body=${await response.text()}`);
    },
    expected: ['status=404 body=Not found'],
  },
  {
    id: 'stream2-doc-the-manifest-of-a-failing-page-answers-instead-of-failing-with-it',
    src: 'janux',
    run: async (log) => {
      const seen = await withErrorSink(async () => {
        const response = await get('/_janux/manifest?path=/boom');
        const manifest = (await response.json()) as { routes: string[]; resources?: unknown[] };

        log.push(`status=${response.status} routes=${manifest.routes.length > 0}`);
      });

      log.push(`reported=${seen.length}`);
    },
    expected: ['status=200 routes=true', 'reported=1'],
  },
  {
    id: 'stream2-doc-the-markdown-projection-of-a-failing-page-does-not-take-the-request-down',
    src: 'janux',
    run: async (log) => {
      const seen = await withErrorSink(async () => {
        const response = await get('/boom.md');

        log.push(`status=${response.status}`);
        await response.text();
      });

      log.push(`reported=${seen.length}`);
    },
    expected: ['status=404', 'reported=1'],
  },
  {
    id: 'stream2-doc-the-markdown-projection-of-a-streaming-page-resolves-its-boundary',
    src: 'janux',
    run: async (log) => {
      const response = await get('/slow.md');
      const markdown = await response.text();

      log.push(`status=${response.status}`);
      log.push(`resolved=${markdown.includes('rows:2')} skeleton=${markdown.includes('loading')}`);
    },
    expected: ['status=200', 'resolved=true skeleton=false'],
  },
  {
    id: 'stream2-doc-abandoning-the-response-cancels-a-render-that-would-never-finish',
    src: 'janux',
    run: async (log) => {
      const response = await app.fetch(new Request('http://test/stuck'));
      const reader = response.body!.getReader();
      const head = await reader.read();

      log.push(`head=${new TextDecoder().decode(head.value).includes('<body>')}`);
      await reader.cancel();
      log.push('cancelled');
    },
    expected: ['head=true', 'cancelled'],
  },
  {
    id: 'stream2-doc-a-never-resolving-boundary-still-lets-the-shell-and-its-fallback-out',
    src: 'janux',
    run: async (log) => {
      const response = await app.fetch(new Request('http://test/stuck'));
      const { received, reader } = await readUntil(response, 'id="jx-runtime-eager"');

      log.push(`fallback=${received.includes('<p>stuck</p>')}`);
      log.push(`unclosed=${!received.includes('</html>')}`);
      await reader.cancel();
    },
    expected: ['fallback=true', 'unclosed=true'],
  },
  {
    id: 'stream2-doc-two-concurrent-requests-for-the-same-streaming-page-do-not-share-a-stream',
    src: 'janux',
    run: async (log) => {
      const [left, right] = await Promise.all([text('/slow'), text('/slow')]);

      log.push(`identical=${left === right}`);
      log.push(`complete=${left.includes('<p>rows:2</p>') && right.includes('<p>rows:2</p>')}`);
    },
    expected: ['identical=true', 'complete=true'],
  },
  {
    id: 'stream2-doc-the-static-page-and-its-streamed-form-carry-the-same-document',
    src: 'janux',
    run: async (log) => {
      const chunks = await responseChunks(await get('/'));

      log.push(`joined=${chunks.join('') === (await text('/'))}`);
    },
    expected: ['joined=true'],
  },
  {
    id: 'stream2-doc-an-error-page-inherits-the-apps-title-having-no-meta-of-its-own',
    src: 'janux',
    run: async (log) => {
      const html = await withErrorSink(async () => undefined).then(() => text('/boom'));

      log.push(`title=${html.includes('<title>Fixture</title>')}`);
    },
    expected: ['title=true'],
  },
  {
    id: 'stream2-doc-a-500-document-is-still-a-document-and-still-streams-in-parts',
    src: 'janux',
    run: async (log) => {
      const chunks = await responseChunks(await get('/boom'));

      log.push(`head-first=${chunks[0]!.startsWith('<!doctype html>')}`);
      log.push(`content-later=${chunks.slice(1).join('').includes('class="broke"')}`);
    },
    expected: ['head-first=true', 'content-later=true'],
  },
  {
    id: 'stream2-doc-the-error-pages-status-travels-with-the-cache-headers-of-a-miss',
    src: 'janux',
    run: async (log) => {
      const missing = await get('/nothing-here');
      const failed = await get('/boom');

      log.push(`404=${missing.status} 500=${failed.status}`);
      log.push(`no-public-cache=${!(missing.headers.get('cache-control') ?? '').includes('public')}`);
      await Promise.all([missing.text(), failed.text()]);
    },
    expected: ['404=404 500=500', 'no-public-cache=true'],
  },
];
