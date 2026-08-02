import { createJanuxServer } from '@janux/server';
import { component, jsx, source } from 'janux';
import { setOnError, setTracer, type ErrorInfo } from 'janux/observability';
import { recordingTracer, type RecordedSpan } from '../../janux/src/observability/__fixtures__/recording-tracer';
import type { ScenarioCase } from '../support/scenario';
import { after, readUntil } from './harness';

/**
 * What a trace of a STREAMED page says. The interesting part is time: the
 * response object exists long before the last byte does, so a span that ends
 * when the handler returns covers a different thing than a span that ends when
 * the stream does — and an operator reading the trace has to be able to tell
 * which failures could still have changed the status line and which could not.
 *
 * `janux-server`'s `observability.test.ts` owns the happy-path span names and
 * the api() pipeline. These rows own the streaming edges: what is still open
 * when the headers go out, what a mid-stream failure does (and does not) put on
 * a span, and what an uninstrumented app is allowed to pay.
 */

const APP = `${import.meta.dirname}/__fixtures__/app`;

const nested = component({
  name: 'otel-child',
  view: () => jsx('b', { children: 'child' }),
});

const parent = component({
  name: 'otel-parent',
  sources: { data: source({ query: () => after(2, ['a']) }) },
  view: () => jsx('div', { children: jsx(nested as any, {}) }),
});

const app = createJanuxServer({
  title: 'Traced',
  routesDir: APP,
  runtimeUrl: '/runtime.js',
  islandModules: { 'slow-list': '/islands/slow.js', 'stuck-list': '/islands/stuck.js' },
});

const inline = createJanuxServer({
  title: 'Traced inline',
  routes: {
    '/nested': () => jsx('main', { children: jsx(parent as any, {}) }),
    '/pair': () => jsx('main', { children: [jsx(nested as any, {}), jsx(nested as any, {})] }),
    '/plain': () => jsx('main', { children: 'plain' }),
  },
});

/** Traces one request end to end, then always unregisters the tracer. */
async function traced(server: { fetch: (req: Request) => Promise<Response> }, path: string) {
  const tracer = recordingTracer();

  setTracer(tracer);
  try {
    const response = await server.fetch(new Request(`http://test${path}`));
    const openAtHeaders = tracer.spans.filter((span) => !span.ended).map((span) => span.name);
    const html = await response.text();

    return { spans: tracer.spans, openAtHeaders, html, status: response.status };
  } finally {
    setTracer(undefined);
  }
}

const named = (spans: RecordedSpan[], name: string): RecordedSpan | undefined => spans.find((span) => span.name === name);

export const OTEL_RENDER_CASES: ScenarioCase[] = [
  {
    id: 'otel-every-span-of-a-streamed-page-is-closed-once-the-last-byte-is-read',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(app, '/slow');

      log.push(`spans=${spans.map(({ name }) => name).join(',')}`);
      log.push(`open=${spans.filter(({ ended }) => !ended).length}`);
    },
    expected: ['spans=janux.request,janux.render,janux.island', 'open=0'],
  },
  {
    id: 'otel-the-island-span-of-a-suspended-island-is-still-open-when-the-headers-go-out',
    src: 'janux',
    run: async (log) => {
      const { openAtHeaders } = await traced(app, '/slow');

      // The response exists as soon as the body stream does: the island whose
      // fallback has not been rendered yet is the work still in flight.
      log.push(`open=${openAtHeaders.join(',')}`);
    },
    expected: ['open=janux.island'],
  },
  {
    id: 'otel-the-request-and-render-spans-close-when-the-response-object-exists-not-when-it-ends',
    src: 'janux',
    run: async (log) => {
      const { openAtHeaders } = await traced(app, '/slow');

      log.push(`request-open=${openAtHeaders.includes('janux.request')}`);
      log.push(`render-open=${openAtHeaders.includes('janux.render')}`);
    },
    expected: ['request-open=false', 'render-open=false'],
  },
  {
    id: 'otel-a-render-that-fails-mid-stream-leaves-no-error-on-any-span',
    src: 'janux',
    run: async (log) => {
      const { spans, status, html } = await traced(app, '/late-boom');

      log.push(`status=${status} in-page=${html.includes('janux:error')}`);
      // The span closed with the headers, long before the failure existed.
      log.push(`recorded=${spans.reduce((total, span) => total + span.errors.length, 0)}`);
    },
    expected: ['status=200 in-page=true', 'recorded=0'],
  },
  {
    id: 'otel-a-render-that-fails-before-the-first-byte-is-reported-but-not-recorded-on-the-span',
    src: 'janux',
    run: async (log) => {
      const seen: ErrorInfo[] = [];

      setOnError((_error, info) => seen.push(info));
      try {
        const { spans, status } = await traced(app, '/boom');

        log.push(`status=${status} sink=${seen.map(({ phase, route }) => `${phase} ${route}`).join(',')}`);
        log.push(`span-errors=${spans.reduce((total, span) => total + span.errors.length, 0)}`);
      } finally {
        setOnError(undefined);
      }
    },
    expected: ['status=500 sink=ssr /boom', 'span-errors=0'],
  },
  {
    id: 'otel-a-404-still-produces-the-request-and-render-spans',
    src: 'janux',
    run: async (log) => {
      const { spans, status } = await traced(app, '/no-such-page');

      log.push(`status=${status} spans=${spans.map(({ name }) => name).join(',')}`);
      log.push(`route=${named(spans, 'janux.render')!.attributes['janux.route']}`);
    },
    expected: ['status=404 spans=janux.request,janux.render', 'route=/no-such-page'],
  },
  {
    id: 'otel-the-markdown-projection-traces-the-page-it-projected-not-the-url-it-was-asked-for',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(app, '/slow.md');

      log.push(`request=${named(spans, 'janux.request')!.attributes['janux.route']}`);
      log.push(`render=${named(spans, 'janux.render')!.attributes['janux.route']}`);
    },
    expected: ['request=/slow.md', 'render=/slow'],
  },
  {
    id: 'otel-the-manifest-endpoint-renders-the-page-and-says-so-in-the-trace',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(app, '/_janux/manifest?path=/slow');

      log.push(spans.map(({ name }) => name).join(','));
      log.push(`render-route=${named(spans, 'janux.render')!.attributes['janux.route']}`);
    },
    expected: ['janux.request,janux.render,janux.island', 'render-route=/slow'],
  },
  {
    id: 'otel-a-markdown-projection-resolves-the-boundary-inside-the-island-span',
    src: 'janux',
    run: async (log) => {
      const { openAtHeaders, spans } = await traced(app, '/slow.md');

      // Buffered: nothing is still running when the response object exists.
      log.push(`open=${openAtHeaders.length}`);
      log.push(`island-parent=${spans[named(spans, 'janux.island')!.parent]!.name}`);
    },
    expected: ['open=0', 'island-parent=janux.render'],
  },
  {
    id: 'otel-a-nested-island-gets-a-span-of-its-own-named-after-its-own-module',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(inline, '/nested');
      const islands = spans.filter(({ name }) => name === 'janux.island');

      // Parenting is the TRACER's job (OTel propagates context; the recording
      // fixture only has a synchronous stack), so this row pins what Janux
      // itself decides: one span per island, named by its module.
      log.push(islands.map(({ attributes }) => attributes['janux.island']).join(','));
      log.push(`all-ended=${islands.every(({ ended }) => ended)}`);
    },
    expected: ['otel-parent,otel-child', 'all-ended=true'],
  },
  {
    id: 'otel-two-sibling-islands-of-one-module-produce-two-separate-spans',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(inline, '/pair');
      const islands = spans.filter(({ name }) => name === 'janux.island');

      log.push(`count=${islands.length}`);
      log.push(`distinct-records=${new Set(islands).size}`);
      log.push(`all-ended=${islands.every(({ ended }) => ended)}`);
    },
    expected: ['count=2', 'distinct-records=2', 'all-ended=true'],
  },
  {
    id: 'otel-the-island-span-is-named-by-its-module-not-by-its-instance-key',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(inline, '/pair');
      const islands = spans.filter(({ name }) => name === 'janux.island');

      log.push(islands.map(({ attributes }) => JSON.stringify(attributes)).join(' '));
    },
    expected: ['{"janux.island":"otel-child"} {"janux.island":"otel-child"}'],
  },
  {
    id: 'otel-a-page-with-no-islands-produces-no-island-span',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(inline, '/plain');

      log.push(spans.map(({ name }) => name).join(','));
    },
    expected: ['janux.request,janux.render'],
  },
  {
    id: 'otel-the-request-span-carries-the-method-and-learns-its-route-after-matching',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(app, '/slow');

      log.push(JSON.stringify(named(spans, 'janux.request')!.attributes));
    },
    expected: ['{"http.request.method":"GET","janux.route":"/slow"}'],
  },
  {
    id: 'otel-an-uninstrumented-app-emits-nothing-for-a-streamed-page-either',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      await (await app.fetch(new Request('http://test/slow'))).text();
      log.push(`spans=${tracer.spans.length}`);
    },
    expected: ['spans=0'],
  },
  {
    id: 'otel-an-exporter-that-throws-on-every-span-does-not-change-the-bytes-of-the-page',
    src: 'janux',
    run: async (log) => {
      const clean = await (await app.fetch(new Request('http://test/slow'))).text();

      setTracer({
        span: () => {
          throw new Error('exporter down');
        },
      });
      try {
        const response = await app.fetch(new Request('http://test/slow'));
        const traced = await response.text();

        log.push(`status=${response.status}`);
        // The state script carries a timestamp-free payload, so the two
        // documents are comparable byte for byte.
        log.push(`identical=${clean === traced}`);
      } finally {
        setTracer(undefined);
      }
    },
    expected: ['status=200', 'identical=true'],
  },
  {
    id: 'otel-an-exporter-that-throws-degrades-once-not-once-per-span',
    src: 'janux',
    run: async (log) => {
      const warnings: string[] = [];

      setOnError((error, info) => {
        if (info.level === 'warning') warnings.push(String(error));
      });
      setTracer({
        span: () => {
          throw new Error('exporter down');
        },
      });
      try {
        await (await app.fetch(new Request('http://test/slow'))).text();
        await (await app.fetch(new Request('http://test/slow'))).text();
        log.push(`warnings=${warnings.length}`);
        log.push(`says=${warnings[0]?.includes('tracing is degraded')}`);
      } finally {
        setTracer(undefined);
        setOnError(undefined);
      }
    },
    expected: ['warnings=1', 'says=true'],
  },
  {
    id: 'otel-registering-a-new-tracer-gives-the-degraded-reporter-a-fresh-chance',
    src: 'janux',
    run: async (log) => {
      const warnings: string[] = [];
      const broken = {
        span: () => {
          throw new Error('exporter down');
        },
      };

      setOnError((_error, info) => {
        if (info.level === 'warning') warnings.push(info.phase);
      });
      try {
        setTracer(broken);
        await (await app.fetch(new Request('http://test/plain'))).text();
        setTracer(broken);
        await (await app.fetch(new Request('http://test/plain'))).text();
        log.push(`warnings=${warnings.join(',')}`);
      } finally {
        setTracer(undefined);
        setOnError(undefined);
      }
    },
    expected: ['warnings=observability,observability'],
  },
  {
    id: 'otel-a-page-abandoned-mid-stream-still-closes-the-spans-it-opened',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      setTracer(tracer);
      try {
        const response = await app.fetch(new Request('http://test/stuck'));
        const { reader } = await readUntil(response, '<body>');

        await reader.cancel();
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`open=${tracer.spans.filter(({ ended }) => !ended).map(({ name }) => name).join(',') || 'none'}`);
      } finally {
        setTracer(undefined);
      }
    },
    expected: ['open=none'],
  },
  {
    id: 'otel-the-trace-of-a-streamed-page-reads-request-then-render-then-island',
    src: 'janux',
    run: async (log) => {
      const { spans } = await traced(app, '/slow');

      log.push(spans.map((span, index) => `${span.name}<-${span.parent === -1 ? 'root' : spans[span.parent]!.name}${index === 0 ? '' : ''}`).join(' | '));
    },
    expected: ['janux.request<-root | janux.render<-janux.request | janux.island<-janux.render'],
  },
];
