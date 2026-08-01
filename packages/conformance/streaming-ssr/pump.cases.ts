import { component, jsx, renderToStream, source } from 'janux';
import type { ScenarioCase } from '../support/scenario';
import { after, chunksOf, driving, endsOnTagBoundary, gated, settle, timed } from './harness';

/**
 * The push pump and the abandonment path: what the renderer must do while
 * nobody is reading, and what it must stop doing when the reader leaves.
 *
 * The coalescer buffers chunks and arms at most one macrotask timer per flush
 * window — the previous shape armed one per raw chunk and pinned ~800KB of
 * promise machinery per render. These rows pin the properties that survive a
 * rewrite of the emission path (nothing leaks, nothing is emitted after
 * cancellation, no chunk ends mid-tag) rather than how many chunks come out or
 * how large they are, which the throughput work is free to change.
 */

/** Runs `body` with `setTimeout`/`clearTimeout` counted, and restores them. */
async function timers<T>(body: () => Promise<T>): Promise<{ result: T; armed: number; live: number }> {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const pending = new Set<unknown>();
  let armed = 0;

  globalThis.setTimeout = ((fn: any, ms?: number, ...rest: any[]) => {
    armed += 1;
    const handle: any = realSet(
      (...args: any[]) => {
        pending.delete(handle);

        return fn(...args);
      },
      ms,
      ...rest,
    );

    pending.add(handle);

    return handle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle: any) => {
    pending.delete(handle);

    return realClear(handle);
  }) as typeof clearTimeout;
  try {
    const result = await body();

    return { result, armed, live: pending.size };
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
}

/** A page of `width` static children with one async island at the end. */
const widePage = (name: string, width: number) =>
  jsx('main', {
    children: [...[...Array(width).keys()].map((n) => jsx('p', { children: n })), jsx(islandOf(name) as any, {})],
  });

const islandOf = (name: string) =>
  component({
    name,
    sources: { data: source({ query: () => after(2, ['a']) }) },
    view: () => jsx('b', { children: name }),
  });

export const PUMP_CASES: ScenarioCase[] = [
  {
    id: 'stream2-pump-arming-does-not-grow-with-the-size-of-the-static-tree',
    src: 'janux',
    run: async (log) => {
      const narrow = await timers(() => chunksOf(widePage('pump-narrow', 4)));
      const wide = await timers(() => chunksOf(widePage('pump-wide', 400)));

      // A hundredfold more elements, the same number of real pauses.
      log.push(`grew-by=${wide.armed - narrow.armed <= 2}`);
    },
    expected: ['grew-by=true'],
  },
  {
    id: 'stream2-pump-no-timer-outlives-the-stream-it-was-armed-for',
    src: 'janux',
    run: async (log) => {
      const { live } = await timers(() => chunksOf(widePage('pump-leak', 40)));

      log.push(`live-after=${live}`);
    },
    expected: ['live-after=0'],
  },
  {
    id: 'stream2-pump-a-cancelled-stream-leaves-no-timer-armed-either',
    src: 'janux',
    run: async (log) => {
      const { live } = await timers(async () => {
        const { def } = gated('pump-leak-cancel');
        const stream = driving(jsx('main', { children: jsx(def as any, {}) }));

        await settle();
        stream.cancel();
        await stream.finished;
        await stream.done;
      });

      log.push(`live-after=${live}`);
    },
    expected: ['live-after=0'],
  },
  {
    id: 'stream2-pump-no-chunk-of-a-static-page-ends-inside-a-tag',
    src: 'janux',
    run: async (log) => {
      const chunks = await chunksOf(jsx('main', { children: [...Array(200).keys()].map((n) => jsx('p', { class: `c${n}`, children: n })) }));

      log.push(`safe=${chunks.every(endsOnTagBoundary)} empty=${chunks.some((chunk) => chunk === '')}`);
    },
    expected: ['safe=true empty=false'],
  },
  {
    id: 'stream2-pump-no-chunk-of-an-island-page-ends-inside-a-tag',
    src: 'janux',
    run: async (log) => {
      const chunks = await chunksOf(
        jsx('main', { children: [jsx(islandOf('pump-i1') as any, {}), jsx('hr', {}), jsx(islandOf('pump-i2') as any, {})] }),
      );

      log.push(`safe=${chunks.every(endsOnTagBoundary)} empty=${chunks.some((chunk) => chunk === '')}`);
    },
    expected: ['safe=true empty=false'],
  },
  {
    id: 'stream2-pump-no-boundary-chunk-ends-inside-a-tag',
    src: 'janux',
    run: async (log) => {
      const chunks = await chunksOf(jsx('main', { children: [jsx(timed('pump-b1', 2) as any, {}), jsx(timed('pump-b2', 6) as any, {})] }));

      log.push(`safe=${chunks.every(endsOnTagBoundary)} empty=${chunks.some((chunk) => chunk === '')}`);
    },
    expected: ['safe=true empty=false'],
  },
  {
    id: 'stream2-pump-cancelling-before-the-first-read-emits-nothing-at-all',
    src: 'janux',
    run: async (log) => {
      const { chunks, done, cancel } = renderToStream(jsx('main', { children: jsx(timed('pump-early', 4) as any, {}) }));

      cancel();
      const collected: string[] = [];

      for await (const chunk of chunks) collected.push(chunk);
      await done;
      log.push(`bytes=${collected.join('').length}`);
    },
    expected: ['bytes=0'],
  },
  {
    id: 'stream2-pump-cancelling-twice-settles-once-and-changes-nothing',
    src: 'janux',
    run: async (log) => {
      const { def } = gated('pump-twice');
      const stream = driving(jsx('main', { children: jsx(def as any, {}) }));

      await settle();
      stream.cancel();
      stream.cancel();
      await stream.finished;
      await stream.done;
      log.push(`shell=${stream.text().includes('data-jx-pending')} boundary=${stream.text().includes('<template id="jxu:')}`);
    },
    expected: ['shell=true boundary=false'],
  },
  {
    id: 'stream2-pump-a-source-that-never-settles-still-lets-cancel-finish-the-stream',
    src: 'janux',
    run: async (log) => {
      const forever = component({
        name: 'pump-forever',
        sources: { data: source({ query: () => new Promise<string[]>(() => undefined) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: () => jsx('p', { children: 'never' }),
      });
      const stream = driving(jsx('main', { children: jsx(forever as any, {}) }));

      await settle();
      stream.cancel();
      await stream.finished;
      await stream.done;
      log.push('settled');
    },
    expected: ['settled'],
  },
  {
    id: 'stream2-pump-abandoning-the-loop-stops-the-renderer-descending-into-new-islands',
    src: 'janux',
    run: async (log) => {
      let mounted = 0;
      const counted = component({
        name: 'pump-counted',
        sources: { data: source({ query: () => { mounted += 1; return after(2, ['a']); } }) },
        view: () => jsx('b', { children: 'x' }),
      });
      const gate = gated('pump-abandon');
      const { chunks } = renderToStream(
        jsx('main', { children: [jsx(gate.def as any, {}), ...[...Array(5).keys()].map((n) => jsx(counted as any, { key: `c${n}` }))] }),
      );

      for await (const chunk of chunks) {
        void chunk;
        break;
      }
      const before = mounted;

      gate.release(['a']);
      await settle();
      log.push(`no-new-work=${mounted === before}`);
    },
    expected: ['no-new-work=true'],
  },
  {
    id: 'stream2-pump-done-resolves-rather-than-rejects-when-the-render-throws',
    src: 'janux',
    run: async (log) => {
      const { chunks, done } = renderToStream(jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(() => { throw new Error('nope'); }, {})] }));

      try {
        for await (const chunk of chunks) void chunk;
      } catch (error) {
        log.push(`chunks-threw:${(error as Error).message}`);
      }
      const summary = await done;

      log.push(`done-resolved islands=${summary.registry.islands.length}`);
    },
    expected: ['chunks-threw:nope', 'done-resolved islands=0'],
  },
  {
    id: 'stream2-pump-what-rendered-before-a-failure-is-flushed-before-the-throw',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(jsx('main', { children: [jsx('h1', { children: 'kept' }), jsx(() => { throw new Error('late'); }, {})] }));
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
      } catch (error) {
        log.push(`threw:${(error as Error).message}`);
      }
      log.push(`kept=${collected.join('').includes('<h1>kept</h1>')}`);
    },
    expected: ['threw:late', 'kept=true'],
  },
  {
    id: 'stream2-pump-a-failing-render-still-reports-the-islands-that-did-register',
    src: 'janux',
    run: async (log) => {
      const ok = component({ name: 'pump-ok', view: () => jsx('p', { children: 'ok' }) });
      const { chunks, done } = renderToStream(jsx('main', { children: [jsx(ok as any, {}), jsx(() => { throw new Error('x'); }, {})] }));

      try {
        for await (const chunk of chunks) void chunk;
      } catch {
        // The throw is the point of the row above; here only `done` matters.
      }
      const summary = await done;

      log.push(summary.registry.islands.map(({ def }) => def.name).join(','));
    },
    expected: ['pump-ok'],
  },
  {
    id: 'stream2-pump-the-generator-is-exhausted-once-the-page-is-complete',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(jsx('main', { children: 'done' }));

      for await (const chunk of chunks) void chunk;
      const again = await chunks.next();

      log.push(`done=${again.done} value=${String(again.value)}`);
    },
    expected: ['done=true value=undefined'],
  },
  {
    id: 'stream2-pump-a-page-that-renders-to-nothing-yields-no-chunk',
    src: 'janux',
    run: async (log) => {
      log.push(`empty=${(await chunksOf(null)).length === 0}`);
      log.push(`false=${(await chunksOf(false)).length === 0}`);
    },
    expected: ['empty=true', 'false=true'],
  },
  {
    id: 'stream2-pump-two-concurrent-renders-of-the-same-page-do-not-share-key-sequences',
    src: 'janux',
    run: async (log) => {
      const def = islandOf('pump-concurrent');
      const page = () => jsx('main', { children: jsx(def as any, {}) });
      const [left, right] = await Promise.all([chunksOf(page()), chunksOf(page())]);

      log.push(`same=${left.join('') === right.join('')}`);
      log.push(`keyed=${left.join('').includes('data-jx="pump-concurrent#default"')}`);
    },
    expected: ['same=true', 'keyed=true'],
  },
  {
    id: 'stream2-pump-cancelling-mid-flush-drops-the-boundaries-still-in-flight',
    src: 'janux',
    run: async (log) => {
      const first = gated('pump-flush-a');
      const second = gated('pump-flush-b');
      const stream = driving(jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] }));

      await settle();
      first.release(['a']);
      await settle();
      stream.cancel();
      second.release(['b']);
      await stream.finished;
      await stream.done;
      const text = stream.text();

      log.push(`first=${text.includes('<template id="jxu:pump-flush-a#default"')} second=${text.includes('<template id="jxu:pump-flush-b#default"')}`);
    },
    expected: ['first=true second=false'],
  },
  {
    id: 'stream2-pump-a-source-that-rejects-leaves-the-island-empty-instead-of-failing-the-page',
    src: 'janux',
    run: async (log) => {
      const failing = component({
        name: 'pump-reject',
        sources: { data: source({ query: () => Promise.reject(new Error('offline')) }) },
        view: ({ sources }: any) => jsx('p', { children: `value:${String(sources.data.value)}` }),
      });
      const chunks = await chunksOf(jsx('main', { children: [jsx('h1', { children: 'up' }), jsx(failing as any, {})] }));
      const text = chunks.join('');

      log.push(`page=${text.includes('<h1>up</h1>')} island=${text.includes('<p>value:undefined</p>')}`);
    },
    expected: ['page=true island=true'],
  },
  {
    id: 'stream2-pump-a-source-that-rejects-under-a-boundary-still-swaps-its-content-in',
    src: 'janux',
    run: async (log) => {
      const failing = component({
        name: 'pump-reject-susp',
        sources: { data: source({ query: () => after(4, null).then(() => Promise.reject(new Error('offline'))) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: ({ sources }: any) => jsx('p', { children: `value:${String(sources.data.value)}` }),
      });
      const text = (await chunksOf(jsx('main', { children: jsx(failing as any, {}) }))).join('');

      log.push(`fallback=${text.includes('<p>wait</p>')} swap=${text.includes('<template id="jxu:pump-reject-susp#default"')}`);
    },
    expected: ['fallback=true swap=true'],
  },
  {
    id: 'stream2-pump-the-chunks-a-cancelled-stream-emitted-are-a-prefix-of-the-full-render',
    src: 'janux',
    run: async (log) => {
      const page = () => jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(timed('pump-prefix', 8) as any, {}), jsx('footer', { children: 'z' })] });
      const full = (await chunksOf(page())).join('');
      const stream = driving(page());

      await settle();
      stream.cancel();
      await stream.finished;
      await stream.done;
      log.push(`prefix=${full.startsWith(stream.text())} shorter=${stream.text().length < full.length}`);
    },
    expected: ['prefix=true shorter=true'],
  },
  {
    id: 'stream2-pump-cancelling-does-not-strand-a-rejected-boundary-promise',
    src: 'janux',
    run: async (log) => {
      const rejections: unknown[] = [];
      const onRejection = (event: any) => {
        rejections.push(event.reason ?? event);
        event.preventDefault?.();
      };

      process.on('unhandledRejection', onRejection);
      const gate = gated('pump-stranded');
      const stream = driving(jsx('main', { children: jsx(gate.def as any, {}) }));

      await settle();
      stream.cancel();
      gate.reject(new Error('abandoned'));
      await stream.finished;
      await stream.done;
      await settle();
      process.off('unhandledRejection', onRejection);
      log.push(`unhandled=${rejections.length}`);
    },
    expected: ['unhandled=0'],
  },
  {
    id: 'stream2-pump-an-abandoned-stream-settles-done-without-waiting-for-its-gates',
    src: 'janux',
    run: async (log) => {
      const { def } = gated('pump-nowait');
      const stream = driving(jsx('main', { children: jsx(def as any, {}) }));

      await settle();
      const started = performance.now();

      stream.cancel();
      await stream.done;
      log.push(`prompt=${performance.now() - started < 100}`);
    },
    expected: ['prompt=true'],
  },
];
