import { component, jsx, source } from 'janux';
import type { Case } from '../support/case';
import { after, drained, driving, gated, settle, timed } from './harness';

/**
 * What a reader of the stream is allowed to rely on: the ORDER in which things
 * appear, never where the pipeline chose to cut. Every row names markers that
 * must all be present and must appear in exactly the order listed.
 *
 * This is the half of the streaming contract a throughput rewrite is most
 * likely to break by accident — merge two writes, hoist the runtime, flush the
 * boundaries as one batch — and the half a browser actually depends on: the
 * fallback has to be in the document before the chunk that replaces it, the
 * runtime has to exist before the call that uses it.
 */

export interface OrderCase {
  /** Drives one page to completion and returns the joined stream. */
  stream: () => Promise<string>;
  /** Markers, in the order the stream must carry them. */
  order: string[];
}

export type OrderRow = Case<OrderCase>;

/** Two gated islands, released in the order the row asks for. */
async function pair(names: [string, string], release: (first: () => void, second: () => void) => Promise<void>): Promise<string> {
  const first = gated(names[0]);
  const second = gated(names[1]);
  const stream = driving(jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] }));

  await settle();
  await release(() => first.release(['a']), () => second.release(['b']));
  await stream.finished;

  return stream.text();
}

export const ORDER_CASES: OrderRow[] = [
  {
    id: 'stream2-ord-the-fallback-is-in-the-document-before-the-chunk-that-replaces-it',
    src: 'janux',
    stream: () => drained(jsx('main', { children: jsx(timed('ord-swap', 4) as any, {}) })),
    order: ['data-jx-pending', '<p>wait:ord-swap</p>', '<template id="jxu:ord-swap#default"', '<p>got:ord-swap</p>'],
  },
  {
    id: 'stream2-ord-the-runtime-exists-before-the-first-call-that-uses-it',
    src: 'janux',
    stream: () => drained(jsx(timed('ord-runtime', 4) as any, {})),
    order: ['self.jx$u=', 'jx$u("ord-runtime#default",document.currentScript)'],
  },
  {
    id: 'stream2-ord-a-boundarys-content-template-precedes-its-own-call-script',
    src: 'janux',
    stream: () => drained(jsx(timed('ord-template', 4) as any, {})),
    order: ['<template id="jxu:ord-template#default"', '</template>', 'id="jxs:ord-template#default"'],
  },
  {
    id: 'stream2-ord-the-inert-sentinel-closes-the-chunk-after-the-call-script',
    src: 'janux',
    stream: () => drained(jsx(timed('ord-sentinel', 4) as any, {})),
    order: ['id="jxs:ord-sentinel#default"', 'key="jxq:ord-sentinel#default"'],
  },
  {
    id: 'stream2-ord-the-page-shell-closes-before-any-boundary-chunk-opens',
    src: 'janux',
    stream: () => drained(jsx('main', { children: [jsx(timed('ord-shell', 4) as any, {}), jsx('footer', { children: 'end' })] })),
    order: ['<footer>end</footer>', '</main>', '<template id="jxu:ord-shell#default"'],
  },
  {
    id: 'stream2-ord-the-runtime-precedes-the-second-boundarys-call-too',
    src: 'janux',
    stream: () => pair(['ord-two-a', 'ord-two-b'], async (a, b) => {
      a();
      await settle();
      b();
    }),
    // The runtime rides inside the FIRST call script's own tag, so the id
    // attribute of that script necessarily precedes it.
    order: ['id="jxs:ord-two-a#default"', 'self.jx$u=', 'id="jxs:ord-two-b#default"'],
  },
  {
    id: 'stream2-ord-each-boundary-chunk-is-template-call-sentinel-before-the-next-one-starts',
    src: 'janux',
    stream: () => pair(['ord-seq-a', 'ord-seq-b'], async (a, b) => {
      a();
      await settle();
      b();
    }),
    order: [
      '<template id="jxu:ord-seq-a#default"',
      'id="jxs:ord-seq-a#default"',
      'key="jxq:ord-seq-a#default"',
      '<template id="jxu:ord-seq-b#default"',
      'id="jxs:ord-seq-b#default"',
      'key="jxq:ord-seq-b#default"',
    ],
  },
  {
    id: 'stream2-ord-both-fallbacks-are-in-the-shell-before-either-swap-arrives',
    src: 'janux',
    stream: () => pair(['ord-fb-a', 'ord-fb-b'], async (a, b) => {
      b();
      await settle();
      a();
    }),
    order: [
      'data-jx="ord-fb-a#default" data-jx-pending',
      'data-jx="ord-fb-b#default" data-jx-pending',
      '<template id="jxu:ord-fb-b#default"',
      '<template id="jxu:ord-fb-a#default"',
    ],
  },
  {
    id: 'stream2-ord-a-boundary-nested-in-another-flushes-after-the-chunk-that-reveals-its-host',
    src: 'janux',
    stream: async () => {
      const inner = timed('ord-inner', 2);
      const outer = component({
        name: 'ord-outer',
        sources: { data: source({ query: () => after(6, ['a']) }) },
        suspense: () => jsx('p', { children: 'outer-wait' }),
        view: () => jsx('div', { children: jsx(inner as any, {}) }),
      });

      return drained(jsx('main', { children: jsx(outer as any, {}) }));
    },
    order: ['<template id="jxu:ord-outer#default"', 'id="jxs:ord-outer#default"', '<template id="jxu:ord-inner'],
  },
  {
    id: 'stream2-ord-a-fail-soft-report-rides-behind-the-call-script-of-its-own-boundary',
    src: 'janux',
    stream: async () => {
      const def = component({
        name: 'ord-failsoft',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        view: () => {
          throw new Error('late');
        },
      });

      return drained(jsx(def as any, {}));
    },
    order: ['<template id="jxu:ord-failsoft#default"', 'id="jxs:ord-failsoft#default"', 'id="jxe:ord-failsoft#default"', 'key="jxq:ord-failsoft#default"'],
  },
  {
    id: 'stream2-ord-a-non-suspended-islands-failure-is-reported-after-its-own-content',
    src: 'janux',
    stream: async () => {
      const def = component({
        name: 'ord-inline-fail',
        view: () => jsx('div', { children: [jsx('p', { children: 'partial' }), jsx(() => { throw new Error('boom'); }, {})] }),
      });

      return drained(jsx('main', { children: jsx(def as any, {}) }));
    },
    order: ['<p>partial</p>', '</div>', 'id="jxe:ord-inline-fail#default"', '</janux-island>'],
  },
  {
    id: 'stream2-ord-the-interlude-lands-between-the-shell-and-the-first-boundary',
    src: 'janux',
    stream: () =>
      drained(jsx('main', { children: jsx(timed('ord-interlude', 4) as any, {}) }), {
        onBeforeBoundaries: () => '<!--between-->',
      }),
    order: ['</janux-island>', '</main>', '<!--between-->', '<template id="jxu:ord-interlude#default"'],
  },
  {
    id: 'stream2-ord-static-siblings-after-a-suspended-island-precede-every-boundary-chunk',
    src: 'janux',
    stream: () =>
      drained(
        jsx('main', {
          children: [jsx(timed('ord-siblings', 5) as any, {}), jsx('h1', { children: 'one' }), jsx('h2', { children: 'two' })],
        }),
      ),
    order: ['<p>wait:ord-siblings</p>', '<h1>one</h1>', '<h2>two</h2>', '<template id="jxu:ord-siblings#default"'],
  },
  {
    id: 'stream2-ord-a-nested-fallback-island-boots-under-the-fb-namespace-before-the-swap',
    src: 'janux',
    stream: async () => {
      const badge = component({ name: 'ord-badge', view: () => jsx('b', { children: 'x' }) });
      const def = component({
        name: 'ord-fbhost',
        sources: { data: source({ query: () => after(5, ['a']) }) },
        suspense: () => jsx('div', { children: jsx(badge as any, {}) }),
        view: () => jsx('p', { children: 'real' }),
      });

      return drained(jsx(def as any, {}));
    },
    order: ['data-jx="ord-badge#ord-fbhost.default~fb.1"', '<template id="jxu:ord-fbhost#default"', '<p>real</p>'],
  },
  {
    id: 'stream2-ord-an-error-view-replaces-the-content-inside-the-same-template',
    src: 'janux',
    stream: async () => {
      const def = component({
        name: 'ord-errview',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'wait' }),
        error: ({ error }: any) => jsx('p', { children: `bad:${(error as Error).message}` }),
        view: () => {
          throw new Error('late');
        },
      });

      return drained(jsx(def as any, {}));
    },
    order: ['<template id="jxu:ord-errview#default"', '<p>bad:late</p>', '</template>', 'id="jxs:ord-errview#default"'],
  },
  {
    id: 'stream2-ord-three-boundaries-flush-one-after-another-never-interleaved',
    src: 'janux',
    stream: async () => {
      const stream = driving(
        jsx('main', {
          children: [jsx(timed('ord-t1', 2) as any, {}), jsx(timed('ord-t2', 6) as any, {}), jsx(timed('ord-t3', 10) as any, {})],
        }),
      );

      await stream.finished;

      return stream.text();
    },
    order: [
      'key="jxq:ord-t1#default"',
      '<template id="jxu:ord-t2#default"',
      'key="jxq:ord-t2#default"',
      '<template id="jxu:ord-t3#default"',
      'key="jxq:ord-t3#default"',
    ],
  },
  {
    id: 'stream2-ord-a-nonced-runtime-precedes-the-nonced-swap-of-the-next-boundary',
    src: 'janux',
    stream: () =>
      drained(
        jsx('main', { children: [jsx(timed('ord-n1', 2) as any, {}), jsx(timed('ord-n2', 6) as any, {})] }),
        { nonce: 'abc' },
      ),
    order: ['id="jxs:ord-n1#default" key="jxu:ord-n1#default" nonce="abc"', 'self.jx$u=', 'id="jxs:ord-n2#default" key="jxu:ord-n2#default" nonce="abc"'],
  },
  {
    id: 'stream2-ord-an-islands-open-tag-precedes-the-content-its-sources-produced',
    src: 'janux',
    stream: async () => {
      const def = component({
        name: 'ord-open',
        sources: { data: source({ query: () => after(5, ['a', 'b']) }) },
        view: ({ sources }: any) => jsx('p', { children: `rows:${sources.data.value.length}` }),
      });

      return drained(jsx('main', { children: [jsx('h1', { children: 'before' }), jsx(def as any, {})] }));
    },
    order: ['<h1>before</h1>', '<janux-island key="ord-open#default"', '<p>rows:2</p>', '</janux-island>', '</main>'],
  },
  {
    id: 'stream2-ord-the-swap-of-a-three-level-nesting-goes-outermost-first',
    src: 'janux',
    stream: async () => {
      const third = component({
        name: 'ord-l3',
        sources: { data: source({ query: () => after(2, ['a']) }) },
        suspense: () => jsx('p', { children: 'w3' }),
        view: () => jsx('p', { children: 'r3' }),
      });
      const second = component({
        name: 'ord-l2',
        sources: { data: source({ query: () => after(3, ['a']) }) },
        suspense: () => jsx('p', { children: 'w2' }),
        view: () => jsx('div', { children: jsx(third as any, {}) }),
      });
      const first = component({
        name: 'ord-l1',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w1' }),
        view: () => jsx('div', { children: jsx(second as any, {}) }),
      });

      return drained(jsx('main', { children: jsx(first as any, {}) }));
    },
    order: ['<template id="jxu:ord-l1#default"', '<template id="jxu:ord-l2', '<template id="jxu:ord-l3'],
  },
  {
    id: 'stream2-ord-a-nested-boundarys-fallback-travels-inside-its-parents-template',
    src: 'janux',
    stream: async () => {
      const inner = component({
        name: 'ord-nfb-in',
        sources: { data: source({ query: () => after(8, ['a']) }) },
        suspense: () => jsx('p', { children: 'inner-wait' }),
        view: () => jsx('p', { children: 'inner-real' }),
      });
      const outer = component({
        name: 'ord-nfb-out',
        sources: { data: source({ query: () => after(2, ['a']) }) },
        suspense: () => jsx('p', { children: 'outer-wait' }),
        view: () => jsx('div', { children: jsx(inner as any, {}) }),
      });

      return drained(jsx('main', { children: jsx(outer as any, {}) }));
    },
    order: ['<p>outer-wait</p>', '<template id="jxu:ord-nfb-out#default"', '<p>inner-wait</p>', '</template>', '<template id="jxu:ord-nfb-in'],
  },
  {
    id: 'stream2-ord-an-islands-content-precedes-the-fail-soft-report-that-follows-it',
    src: 'janux',
    stream: async () => {
      const def = component({
        name: 'ord-partial',
        sources: { data: source({ query: () => after(3, ['a']) }) },
        view: () => jsx('div', { children: [jsx('p', { children: 'first' }), jsx(() => { throw new Error('stop'); }, {})] }),
      });

      return drained(jsx('main', { children: [jsx(def as any, {}), jsx('footer', { children: 'tail' })] }));
    },
    order: ['<p>first</p>', 'id="jxe:ord-partial#default"', '</janux-island>', '<footer>tail</footer>'],
  },
  {
    id: 'stream2-ord-a-static-sibling-after-a-failing-island-still-comes-after-it',
    src: 'janux',
    stream: async () => {
      const def = component({ name: 'ord-failfirst', view: () => { throw new Error('nope'); } });

      return drained(jsx('main', { children: [jsx('h1', { children: 'before' }), jsx(def as any, {}), jsx('h2', { children: 'after' })] }));
    },
    order: ['<h1>before</h1>', 'id="jxe:ord-failfirst#default"', '<h2>after</h2>'],
  },
  {
    id: 'stream2-ord-five-boundaries-resolving-in-a-staircase-flush-in-that-order',
    src: 'janux',
    stream: async () => {
      const page = jsx('main', {
        children: [...Array(5).keys()].map((n) => jsx(timed(`ord-stair-${n}`, 2 + n * 4) as any, {})),
      });

      return drained(page);
    },
    order: [...Array(5).keys()].map((n) => `<template id="jxu:ord-stair-${n}#default"`),
  },
  {
    id: 'stream2-ord-a-fallback-of-a-later-boundary-precedes-the-swap-of-an-earlier-one',
    src: 'janux',
    stream: () =>
      drained(jsx('main', { children: [jsx(timed('ord-fbfirst', 6) as any, {}), jsx(timed('ord-fbsecond', 12) as any, {})] })),
    order: ['<p>wait:ord-fbfirst</p>', '<p>wait:ord-fbsecond</p>', '<template id="jxu:ord-fbfirst#default"'],
  },
  {
    id: 'stream2-ord-the-interlude-comes-after-every-fallback-of-the-page',
    src: 'janux',
    stream: () =>
      drained(jsx('main', { children: [jsx(timed('ord-intfb-a', 4) as any, {}), jsx(timed('ord-intfb-b', 6) as any, {})] }), {
        onBeforeBoundaries: () => '<!--gap-->',
      }),
    order: ['<p>wait:ord-intfb-a</p>', '<p>wait:ord-intfb-b</p>', '<!--gap-->', '<template id="jxu:ord-intfb-a#default"'],
  },
  {
    id: 'stream2-ord-an-explicitly-keyed-boundary-keeps-template-call-and-sentinel-adjacent',
    src: 'janux',
    stream: () => drained(jsx('main', { children: jsx(timed('ord-keyed', 4) as any, { key: 'cart' }) })),
    order: ['<template id="jxu:ord-keyed#cart"', 'id="jxs:ord-keyed#cart"', 'key="jxq:ord-keyed#cart"'],
  },
  {
    id: 'stream2-ord-an-islands-nested-child-is-emitted-inside-its-parents-tags',
    src: 'janux',
    stream: async () => {
      const child = component({ name: 'ord-inner-island', view: () => jsx('b', { children: 'in' }) });
      const outer = component({
        name: 'ord-outer-island',
        sources: { data: source({ query: () => after(3, ['a']) }) },
        view: () => jsx('div', { children: jsx(child as any, {}) }),
      });

      return drained(jsx('main', { children: jsx(outer as any, {}) }));
    },
    order: ['<janux-island key="ord-outer-island#default"', '<janux-island key="ord-inner-island#ord-outer-island.default.1"', '</janux-island></div></janux-island>'],
  },
  {
    id: 'stream2-ord-the-boundary-of-a-fallbacks-sibling-still-lands-after-the-shell',
    src: 'janux',
    stream: () =>
      drained(
        jsx('main', {
          children: [jsx('header', { children: 'top' }), jsx(timed('ord-sandwich', 5) as any, {}), jsx('footer', { children: 'bottom' })],
        }),
      ),
    order: ['<header>top</header>', '<p>wait:ord-sandwich</p>', '<footer>bottom</footer>', '</main>', '<template id="jxu:ord-sandwich#default"'],
  },
];
