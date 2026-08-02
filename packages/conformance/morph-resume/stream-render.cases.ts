import { component, jsx, renderToStream, renderToString, source } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The server half of streaming suspense: `renderToStream` ships the fallback
 * inside the page's own HTML and the real content as trailing chunks —
 * a content `<template>`, a self-removing `jx$u` call, and an inert sentinel
 * the navigation diff needs to prove the chunk complete. These rows pin the
 * wire format (the browser corpus in `susp-unsuspense.cases.ts` picks it up
 * from here), the resolution-order flushing, the fail-soft paths, and the
 * ways a boundary can *not* exist: settled-before-flush, buffered renders,
 * `inlineSuspense`, and a cancelled stream.
 */

/** Several timer ticks: chunk coalescing flushes on its own macrotask. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve));
}

/** A suspense island whose sources only settle when the row releases them. */
function gated(name: string) {
  let release!: (rows: string[]) => void;
  const gate = new Promise<string[]>((resolve) => {
    release = resolve;
  });
  const def = component({
    name,
    sources: { data: source({ query: () => gate }) },
    suspense: () => jsx('p', { children: 'wait' }),
    view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
  });

  return { def, release: (rows: string[]) => release(rows) };
}

/** Drains a stream fully and returns the joined bytes. */
async function drained(node: unknown, options?: Record<string, unknown>): Promise<string> {
  const { chunks } = renderToStream(node, options);
  const collected: string[] = [];

  for await (const chunk of chunks) collected.push(chunk);

  return collected.join('');
}

/** Starts draining in the background so a row can release its gate mid-stream. */
function draining(node: unknown, options?: Record<string, unknown>) {
  const { chunks, done, cancel } = renderToStream(node, options);
  const collected: string[] = [];
  const finished = (async () => {
    for await (const chunk of chunks) collected.push(chunk);
  })();

  return { collected, finished, done, cancel };
}

export const STREAM_RENDER_CASES: ScenarioCase[] = [
  {
    id: 'stream-susp-the-fallback-rides-the-shell-and-content-rides-a-template',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-shape');
      const stream = draining(jsx('main', { children: jsx(def as any, {}) }));

      await settle();
      release(['a']);
      await stream.finished;
      const full = stream.collected.join('');
      const shellEnd = full.indexOf('</main>');
      const template = full.indexOf('<template id="jxu:sr-shape#default"');

      log.push(`fallback-in-shell=${full.indexOf('data-jx-pending><p>wait</p>') < shellEnd}`);
      log.push(`template-after-shell=${template > shellEnd}`);
      log.push(`content=${full.includes('<template id="jxu:sr-shape#default" key="jxt:sr-shape#default"><p>got:1</p></template>')}`);
    },
    expected: ['fallback-in-shell=true', 'template-after-shell=true', 'content=true'],
  },
  {
    id: 'stream-susp-the-pending-host-holds-the-fallback-while-sources-load',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-pending');
      const stream = draining(jsx('main', { children: jsx(def as any, {}) }));

      await settle();
      const early = stream.collected.join('');

      log.push(`pending=${early.includes('data-jx="sr-pending#default" data-jx-pending><p>wait</p>')} content-yet=${early.includes('got:')}`);
      release(['a']);
      await stream.finished;
    },
    expected: ['pending=true content-yet=false'],
  },
  {
    id: 'stream-susp-static-siblings-after-a-suspended-island-still-stream',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-siblings');
      const stream = draining(jsx('main', { children: [jsx(def as any, {}), jsx('h1', { children: 'after' })] }));

      await settle();
      const early = stream.collected.join('');

      log.push(`sibling=${early.includes('<h1>after</h1>')} content-yet=${early.includes('got:')}`);
      release(['a', 'b']);
      await stream.finished;
      log.push(`content=${stream.collected.join('').includes('<p>got:2</p>')}`);
    },
    expected: ['sibling=true content-yet=false', 'content=true'],
  },
  {
    id: 'stream-susp-the-swap-call-names-its-boundary-and-removes-itself',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-call');
      const stream = draining(jsx(def as any, {}));

      await settle();
      release(['a']);
      await stream.finished;
      const full = stream.collected.join('');

      log.push(`call=${full.includes('jx$u("sr-call#default",document.currentScript)')}`);
      log.push(`keyed-script=${full.includes('id="jxs:sr-call#default" key="jxu:sr-call#default"')}`);
    },
    expected: ['call=true', 'keyed-script=true'],
  },
  {
    id: 'stream-susp-an-inert-keyed-sentinel-closes-every-boundary-chunk',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-sentinel');
      const stream = draining(jsx(def as any, {}));

      await settle();
      release([]);
      await stream.finished;
      log.push(String(stream.collected.join('').includes('<template data-jxs key="jxq:sr-sentinel#default"></template>')));
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-the-runtime-ships-exactly-once-for-two-boundaries',
    src: 'janux',
    run: async (log) => {
      const first = gated('sr-once-a');
      const second = gated('sr-once-b');
      const stream = draining(jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] }));

      await settle();
      first.release(['a']);
      second.release(['b']);
      await stream.finished;
      log.push(String(stream.collected.join('').split('self.jx$u=').length));
    },
    expected: ['2'],
  },
  {
    id: 'stream-susp-trailing-chunks-flush-in-resolution-order-not-document-order',
    src: 'janux',
    run: async (log) => {
      const first = gated('sr-order-a');
      const second = gated('sr-order-b');
      const stream = draining(jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] }));

      await settle();
      second.release(['b']);
      await settle();
      first.release(['a']);
      await stream.finished;
      const full = stream.collected.join('');

      log.push(String(full.indexOf('id="jxu:sr-order-b#default"') < full.indexOf('id="jxu:sr-order-a#default"')));
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-sources-settling-before-the-flush-leave-no-boundary',
    src: 'janux',
    run: async (log) => {
      const fast = component({
        name: 'sr-fast',
        sources: { data: source({ query: async () => ['a'] }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
      });
      const full = await drained(jsx(fast as any, {}));

      log.push(`inline=${full.includes('data-jx="sr-fast#default"><p>got:1</p>')} machinery=${full.includes('data-jx-pending') || full.includes('<template') || full.includes('jx$u')}`);
    },
    expected: ['inline=true machinery=false'],
  },
  {
    id: 'stream-susp-a-buffered-render-resolves-a-slow-boundary-in-place',
    src: 'janux',
    run: async (log) => {
      const slow = component({
        name: 'sr-buffered',
        sources: { data: source({ query: () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['a']), 5)) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
      });
      const { html } = await renderToString(jsx(slow as any, {}));

      log.push(`inline=${html.includes('<p>got:1</p>')} machinery=${html.includes('<template') || html.includes('data-jx-pending')}`);
    },
    expected: ['inline=true machinery=false'],
  },
  {
    id: 'stream-susp-the-inline-suspense-option-resolves-on-the-stream-too',
    src: 'janux',
    run: async (log) => {
      const slow = component({
        name: 'sr-inline-opt',
        sources: { data: source({ query: () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['a', 'b']), 5)) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
      });
      const full = await drained(jsx(slow as any, {}), { inlineSuspense: true });

      log.push(`inline=${full.includes('<p>got:2</p>')} machinery=${full.includes('<template') || full.includes('jx$u')}`);
    },
    expected: ['inline=true machinery=false'],
  },
  {
    id: 'stream-susp-the-error-view-rides-the-template-when-content-throws',
    src: 'janux',
    run: async (log) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const def = component({
        name: 'sr-error-view',
        sources: { data: source({ query: () => gate.then(() => []) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        error: ({ error }) => jsx('p', { children: `bad:${(error as Error).message}` }),
        view: () => {
          throw new Error('late');
        },
      });
      const stream = draining(jsx(def as any, {}));

      await settle();
      release();
      await stream.finished;
      log.push(String(stream.collected.join('').includes('<template id="jxu:sr-error-view#default" key="jxt:sr-error-view#default"><p>bad:late</p></template>')));
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-a-failure-with-no-error-view-swaps-empty-and-reports',
    src: 'janux',
    run: async (log) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const def = component({
        name: 'sr-fail-soft',
        sources: { data: source({ query: () => gate.then(() => []) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: () => {
          throw new Error('late');
        },
      });
      const stream = draining(jsx(def as any, {}));

      await settle();
      release();
      await stream.finished;
      const full = stream.collected.join('');

      log.push(`empty-template=${full.includes('<template id="jxu:sr-fail-soft#default" key="jxt:sr-fail-soft#default"></template>')} reported=${full.includes('janux:error')}`);
    },
    expected: ['empty-template=true reported=true'],
  },
  {
    id: 'stream-susp-a-throwing-fallback-still-closes-the-island-and-swaps',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sr-bad-fallback',
        sources: { data: source({ query: () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['a']), 5)) }) },
        suspense: () => {
          throw new Error('fallback boom');
        },
        view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
      });
      const full = await drained(jsx('main', { children: jsx(def as any, {}) }));

      log.push(`closed=${full.includes('</main>')} swap=${full.includes('<template id="jxu:sr-bad-fallback#default"')}`);
    },
    expected: ['closed=true swap=true'],
  },
  {
    id: 'stream-susp-a-nonce-rides-the-runtime-and-every-swap-script',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-nonce');
      const stream = draining(jsx(def as any, {}), { nonce: 'n0nce' });

      await settle();
      release(['a']);
      await stream.finished;
      const full = stream.collected.join('');

      log.push(String(full.includes('id="jxs:sr-nonce#default"') && full.includes('nonce="n0nce"')));
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-the-interlude-lands-after-the-shell-and-before-the-boundaries',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-interlude');
      const stream = draining(jsx('main', { children: jsx(def as any, {}) }), {
        onBeforeBoundaries: () => '<!--interlude-->',
      });

      await settle();
      release(['a']);
      await stream.finished;
      const full = stream.collected.join('');
      const interlude = full.indexOf('<!--interlude-->');

      log.push(`after-shell=${interlude > full.indexOf('</main>')} before-boundary=${interlude < full.indexOf('<template id="jxu:sr-interlude#default"')}`);
    },
    expected: ['after-shell=true before-boundary=true'],
  },
  {
    id: 'stream-susp-no-boundaries-means-no-interlude',
    src: 'janux',
    run: async (log) => {
      const fast = component({
        name: 'sr-no-interlude',
        sources: { data: source({ query: async () => ['a'] }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
      });
      const full = await drained(jsx(fast as any, {}), { onBeforeBoundaries: () => '<!--interlude-->' });

      log.push(String(full.includes('<!--interlude-->')));
    },
    expected: ['false'],
  },
  {
    id: 'stream-susp-cancelling-mid-stream-still-settles-done',
    src: 'janux',
    run: async (log) => {
      const { def } = gated('sr-cancel');
      const { chunks, done, cancel } = renderToStream(jsx('main', { children: jsx(def as any, {}) }));

      await chunks.next();
      cancel();
      await done;
      log.push('settled');
    },
    expected: ['settled'],
  },
  {
    id: 'stream-susp-a-cancelled-stream-flushes-no-boundary-chunks',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-cancel-flush');
      const stream = draining(jsx('main', { children: jsx(def as any, {}) }));

      await settle();
      stream.cancel();
      release(['a']);
      await stream.finished;
      await stream.done;
      log.push(String(stream.collected.join('').includes('<template id="jxu:')));
    },
    expected: ['false'],
  },
  {
    id: 'stream-susp-a-fallbacks-nested-island-lives-in-the-fb-namespace',
    src: 'janux',
    run: async (log) => {
      const badge = component({ name: 'sr-fb-badge', view: () => jsx('b', { children: 'x' }) });
      const { def, release } = (() => {
        let releaseGate!: (rows: string[]) => void;
        const gate = new Promise<string[]>((resolve) => {
          releaseGate = resolve;
        });
        const outer = component({
          name: 'sr-fb-outer',
          sources: { data: source({ query: () => gate }) },
          suspense: () => jsx('div', { children: jsx(badge as any, {}) }),
          view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
        });

        return { def: outer, release: releaseGate };
      })();
      const stream = draining(jsx(def as any, {}));

      await settle();
      const early = stream.collected.join('');

      log.push(String(early.includes('~fb')));
      release(['a']);
      await stream.finished;
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-two-boundaries-each-get-their-own-sentinel',
    src: 'janux',
    run: async (log) => {
      const first = gated('sr-two-a');
      const second = gated('sr-two-b');
      const stream = draining(jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] }));

      await settle();
      first.release(['a']);
      second.release(['b']);
      await stream.finished;
      const full = stream.collected.join('');

      log.push(String(full.includes('key="jxq:sr-two-a#default"') && full.includes('key="jxq:sr-two-b#default"')));
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-the-stream-and-the-buffered-render-diverge-only-at-the-boundary',
    src: 'janux',
    run: async (log) => {
      const make = () =>
        component({
          name: 'sr-diverge',
          sources: { data: source({ query: () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['a']), 5)) }) },
          suspense: () => jsx('p', { children: 'wait' }),
          view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
        });
      const page = () => jsx('main', { children: [jsx('h1', { children: 'shop' }), jsx(make() as any, {})] });
      const { html } = await renderToString(page());
      const streamed = await drained(page());

      log.push(`buffered-inline=${html.includes('<p>got:1</p>') && !html.includes('wait')}`);
      log.push(`stream-carries-both=${streamed.includes('<p>wait</p>') && streamed.includes('<p>got:1</p>')}`);
      log.push(`shared-shell=${html.includes('<h1>shop</h1>') && streamed.includes('<h1>shop</h1>')}`);
    },
    expected: ['buffered-inline=true', 'stream-carries-both=true', 'shared-shell=true'],
  },
  {
    id: 'stream-susp-two-renders-of-the-same-page-are-byte-identical',
    src: 'janux',
    run: async (log) => {
      // Island ids come from a per-render key sequence, so a page's bytes are
      // deterministic — the resume contract depends on it.
      const make = () =>
        component({
          name: 'sr-deterministic',
          sources: { data: source({ query: () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['a']), 5)) }) },
          suspense: () => jsx('p', { children: 'wait' }),
          view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
        });
      const page = () => jsx('main', { children: [jsx('h1', { children: 't' }), jsx(make() as any, {})] });
      const first = await drained(page());
      const second = await drained(page());

      log.push(String(first === second));
    },
    expected: ['true'],
  },
  {
    id: 'stream-susp-a-page-with-no-islands-streams-as-pure-html',
    src: 'janux',
    run: async (log) => {
      const full = await drained(jsx('main', { children: [jsx('h1', { children: 'static' }), jsx('p', { children: 'page' })] }));

      log.push(`${full} scripts=${full.includes('<script')}`);
    },
    expected: ['<main><h1>static</h1><p>page</p></main> scripts=false'],
  },
  {
    id: 'stream-susp-done-reports-the-boundary-island-in-the-registry',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-registry');
      const { chunks, done } = renderToStream(jsx(def as any, {}));
      const collected: string[] = [];
      const finished = (async () => {
        for await (const chunk of chunks) collected.push(chunk);
      })();

      await settle();
      release(['a']);
      await finished;
      const summary = await done;

      log.push(summary.registry.islands.map(({ def, key }) => `${def.name}:${key}`).join(','));
    },
    expected: ['sr-registry:default'],
  },
  {
    id: 'stream-susp-i18n-keys-are-empty-without-an-i18n-context',
    src: 'janux',
    run: async (log) => {
      const { chunks, done } = renderToStream(jsx('p', { children: 'x' }));

      for await (const chunk of chunks) void chunk;
      log.push(JSON.stringify((await done).i18nKeys));
    },
    expected: ['[]'],
  },
  {
    id: 'stream-susp-a-boundary-snapshot-carries-the-settled-source-value',
    src: 'janux',
    run: async (log) => {
      const { def, release } = gated('sr-snapshot');
      const { chunks, done } = renderToStream(jsx(def as any, {}));
      const collected: string[] = [];
      const finished = (async () => {
        for await (const chunk of chunks) collected.push(chunk);
      })();

      await settle();
      release(['a', 'b']);
      await finished;
      const summary = await done;

      log.push(JSON.stringify(summary.snapshots[0]?.sources));
    },
    expected: ['{"data":{"value":["a","b"]}}'],
  },
];
