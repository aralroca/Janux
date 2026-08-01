import { component, jsx, renderToStream, renderToString, source } from 'janux';
import type { ScenarioCase } from '../support/scenario';
import { after, drained } from './harness';

/**
 * Where a throw can happen while the page is already going out, and what the
 * pipeline is allowed to do about it. Two rules run through all of it:
 *
 * - Bytes already flushed cannot be taken back, so a failure past the first
 *   flush is CONTAINED (the island fails soft, the tags close) instead of
 *   replacing the page.
 * - A failure nothing contains reaches the consumer as a rejection *after*
 *   everything that did render, so the caller can still ship it.
 */

/** Renders and reports either the joined stream or the message it threw. */
async function outcome(node: unknown, options?: Record<string, unknown>): Promise<string> {
  try {
    return await drained(node, options);
  } catch (error) {
    return `threw:${(error as Error).message}`;
  }
}

const Explode = (props: { message?: string }) => {
  throw new Error(props.message ?? 'boom');
};

/** An island that throws from its view, with no error view of its own. */
const failing = (name: string, message = 'island boom') =>
  component({ name, view: () => { throw new Error(message); } });

/** An island that throws only after its first await — past the open tag. */
const failingLate = (name: string) =>
  component({
    name,
    sources: { data: source({ query: () => after(2, ['a']) }) },
    view: () => { throw new Error('late island boom'); },
  });

const guarded = (name: string, child: unknown) =>
  component({ name, error: ({ error }: any) => jsx('p', { children: `caught:${(error as Error).message}` }), view: () => jsx('div', { children: child }) });

export const STREAM_ERROR_CASES: ScenarioCase[] = [
  {
    id: 'stream2-err-a-plain-component-throwing-at-the-root-rejects-the-stream',
    src: 'janux',
    run: async (log) => {
      log.push(await outcome(jsx(Explode as any, { message: 'root' })));
    },
    expected: ['threw:root'],
  },
  {
    id: 'stream2-err-a-throwing-sibling-lets-the-earlier-ones-out-before-it-rejects',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(Explode as any, { message: 'sibling' })] }));
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
      } catch (error) {
        log.push(`threw:${(error as Error).message}`);
      }
      log.push(`flushed=${collected.join('')}`);
    },
    expected: ['threw:sibling', 'flushed=<main><h1>a</h1></main>'],
  },
  {
    id: 'stream2-err-a-throwing-middle-sibling-does-not-cancel-the-ones-after-it',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(
        jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(Explode as any, {}), jsx('h2', { children: 'c' })] }),
      );
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
      } catch {
        // The rejection is the row above; here only the bytes matter.
      }
      log.push(`kept=${collected.join('')}`);
    },
    expected: ['kept=<main><h1>a</h1><h2>c</h2></main>'],
  },
  {
    id: 'stream2-err-every-open-element-closes-as-the-throw-unwinds-the-stack',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(jsx('main', { children: jsx('section', { children: jsx('div', { children: [jsx('p', { children: 'x' }), jsx(Explode as any, {})] }) }) }));
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
      } catch {
        // Balanced markup is the point; the rejection is pinned elsewhere.
      }
      log.push(collected.join(''));
    },
    expected: ['<main><section><div><p>x</p></div></section></main>'],
  },
  {
    id: 'stream2-err-an-island-with-no-guard-fails-soft-and-the-page-completes',
    src: 'janux',
    run: async (log) => {
      const html = await outcome(jsx('main', { children: [jsx(failing('se-soft') as any, {}), jsx('footer', { children: 'end' })] }));

      log.push(`completed=${html.includes('<footer>end</footer>')}`);
      log.push(`reported=${html.includes('id="jxe:se-soft#default"')}`);
      log.push(`closed=${html.includes('</janux-island><footer>end</footer></main>')}`);
    },
    expected: ['completed=true', 'reported=true', 'closed=true'],
  },
  {
    id: 'stream2-err-the-fail-soft-report-carries-the-message-through-a-json-escape',
    src: 'janux',
    run: async (log) => {
      const html = await outcome(jsx(failing('se-escape', '</script><img src=x onerror=alert(1)>') as any, {}));

      log.push(`broken-out=${html.includes('</script><img')}`);
      log.push(`escaped=${html.includes('\\u003c/script>\\u003cimg src=x onerror=alert(1)>')}`);
    },
    expected: ['broken-out=false', 'escaped=true'],
  },
  {
    id: 'stream2-err-the-fail-soft-script-is-keyed-by-the-island-that-failed',
    src: 'janux',
    run: async (log) => {
      const html = await outcome(jsx('main', { children: [jsx(failing('se-a') as any, {}), jsx(failing('se-b') as any, {})] }));

      log.push(`a=${html.includes('<script id="jxe:se-a#default" key="jxe:se-a#default">')}`);
      log.push(`b=${html.includes('<script id="jxe:se-b#default" key="jxe:se-b#default">')}`);
    },
    expected: ['a=true', 'b=true'],
  },
  {
    id: 'stream2-err-an-island-failing-after-its-first-await-still-closes-its-own-tag',
    src: 'janux',
    run: async (log) => {
      const html = await outcome(jsx('main', { children: [jsx(failingLate('se-late') as any, {}), jsx('footer', { children: 'end' })] }));

      log.push(`open=${html.includes('<janux-island key="se-late#default" data-jx="se-late#default">')}`);
      log.push(`reported=${html.includes('id="jxe:se-late#default"')} tail=${html.includes('<footer>end</footer>')}`);
    },
    expected: ['open=true', 'reported=true tail=true'],
  },
  {
    id: 'stream2-err-a-nested-island-failure-is-taken-by-the-closest-ancestor-guard',
    src: 'janux',
    run: async (log) => {
      const inner = guarded('se-inner-guard', jsx(failing('se-deep', 'deep') as any, {}));
      const html = await outcome(jsx(guarded('se-outer-guard', jsx(inner as any, {})) as any, {}));

      log.push(`inner-caught=${html.includes('<p>caught:deep</p>')}`);
      log.push(`outer-intact=${!html.includes('caught:deep') || html.indexOf('se-outer-guard') < html.indexOf('caught:deep')}`);
      log.push(`fail-soft=${html.includes('id="jxe:se-deep')}`);
    },
    expected: ['inner-caught=true', 'outer-intact=true', 'fail-soft=false'],
  },
  {
    id: 'stream2-err-a-guarded-subtree-that-fails-registers-none-of-its-islands',
    src: 'janux',
    run: async (log) => {
      const survivor = component({ name: 'se-survivor', view: () => jsx('b', { children: 'alive' }) });
      const page = jsx(guarded('se-guard-reg', [jsx(survivor as any, {}), jsx(failing('se-victim') as any, {})]) as any, {});
      const { chunks, done } = renderToStream(page);

      for await (const chunk of chunks) void chunk;
      log.push((await done).registry.islands.map(({ def }) => def.name).join(','));
    },
    expected: ['se-guard-reg'],
  },
  {
    id: 'stream2-err-an-error-view-that-itself-throws-takes-the-stream-down-with-it',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'se-badguard',
        error: () => {
          throw new Error('guard boom');
        },
        view: () => {
          throw new Error('content boom');
        },
      });

      log.push(await outcome(jsx('main', { children: jsx(def as any, {}) })));
    },
    expected: ['threw:guard boom'],
  },
  {
    id: 'stream2-err-the-error-view-receives-the-error-the-subtree-threw',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'se-receives',
        error: ({ error }: any) => jsx('p', { children: `${(error as Error).constructor.name}:${(error as Error).message}` }),
        view: () => {
          throw new TypeError('wrong shape');
        },
      });

      log.push(await outcome(jsx(def as any, {})));
    },
    expected: ['<janux-island key="se-receives#default" data-jx="se-receives#default"><p>TypeError:wrong shape</p></janux-island>'],
  },
  {
    id: 'stream2-err-a-guarded-island-that-succeeds-costs-nothing-extra',
    src: 'janux',
    run: async (log) => {
      const def = component({ name: 'se-ok-guard', error: () => jsx('p', { children: 'bad' }), view: () => jsx('p', { children: 'good' }) });

      log.push(await outcome(jsx(def as any, {})));
    },
    expected: ['<janux-island key="se-ok-guard#default" data-jx="se-ok-guard#default"><p>good</p></janux-island>'],
  },
  {
    id: 'stream2-err-two-islands-failing-independently-are-both-reported',
    src: 'janux',
    run: async (log) => {
      const html = await outcome(jsx('main', { children: [jsx(failing('se-both-a', 'first') as any, {}), jsx(failing('se-both-b', 'second') as any, {})] }));

      log.push(`reports=${(html.match(/janux:error/g) ?? []).length}`);
      log.push(`messages=${html.includes('Error: first') && html.includes('Error: second')}`);
    },
    expected: ['reports=2', 'messages=true'],
  },
  {
    id: 'stream2-err-the-buffered-render-fails-exactly-where-the-stream-does',
    src: 'janux',
    run: async (log) => {
      const page = () => jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(Explode as any, { message: 'parity' })] });
      const streamed = await outcome(page());
      const buffered = await renderToString(page()).then(
        ({ html }) => `html:${html}`,
        (error: Error) => `threw:${error.message}`,
      );

      log.push(`stream=${streamed}`);
      log.push(`buffered=${buffered}`);
    },
    expected: ['stream=threw:parity', 'buffered=threw:parity'],
  },
  {
    id: 'stream2-err-the-buffered-render-fails-soft-for-an-island-exactly-like-the-stream',
    src: 'janux',
    run: async (log) => {
      const page = () => jsx('main', { children: jsx(failing('se-parity-soft', 'soft') as any, {}) });
      const streamed = await outcome(page());
      const { html } = await renderToString(page());

      log.push(`identical=${streamed === html}`);
      log.push(`reported=${html.includes('id="jxe:se-parity-soft#default"')}`);
    },
    expected: ['identical=true', 'reported=true'],
  },
  {
    id: 'stream2-err-nothing-is-emitted-after-the-stream-has-rejected',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(Explode as any, {})] }));

      try {
        for await (const chunk of chunks) void chunk;
      } catch {
        // Expected; what matters is that the generator is finished.
      }
      const next = await chunks.next();

      log.push(`done=${next.done} value=${String(next.value)}`);
    },
    expected: ['done=true value=undefined'],
  },
  {
    id: 'stream2-err-an-island-whose-instance-cannot-be-built-fails-before-its-open-tag',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'se-badstate',
        state: { not: 'a schema' } as any,
        view: () => jsx('p', { children: 'never' }),
      });
      const { chunks } = renderToStream(jsx('main', { children: jsx(def as any, {}) }));
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
        log.push('no-throw');
      } catch {
        log.push(`open-tag=${collected.join('').includes('se-badstate')}`);
      }
    },
    expected: ['open-tag=false'],
  },
  {
    id: 'stream2-err-a-throw-inside-a-fragment-behaves-like-a-throw-inside-an-element',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream([jsx('h1', { children: 'a' }), jsx(Explode as any, { message: 'frag' })]);
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
      } catch (error) {
        log.push(`threw:${(error as Error).message} kept=${collected.join('')}`);
      }
    },
    expected: ['threw:frag kept=<h1>a</h1>'],
  },
  {
    id: 'stream2-err-two-siblings-failing-at-once-surface-the-first-in-document-order',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(jsx('main', { children: [jsx(Explode as any, { message: 'left' }), jsx(Explode as any, { message: 'right' })] }));

      try {
        for await (const chunk of chunks) void chunk;
      } catch (error) {
        log.push((error as Error).message);
      }
    },
    expected: ['left'],
  },
  {
    id: 'stream2-err-a-failure-under-a-boundary-never-reaches-an-ancestor-guard',
    src: 'janux',
    run: async (log) => {
      const suspended = component({
        name: 'se-susp-fail',
        sources: { data: source({ query: () => after(3, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => {
          throw new Error('boundary boom');
        },
      });
      const html = await outcome(jsx(guarded('se-susp-guard', jsx(suspended as any, {})) as any, {}));

      log.push(`guard-untouched=${!html.includes('caught:')}`);
      // The boundary island is nested, so its id is namespaced by the guard.
      log.push(`boundary-reported=${html.includes('id="jxe:se-susp-fail#se-susp-guard.default.1"')}`);
    },
    expected: ['guard-untouched=true', 'boundary-reported=true'],
  },
  {
    id: 'stream2-err-a-failure-in-one-island-does-not-hold-back-a-slower-sibling',
    src: 'janux',
    run: async (log) => {
      const slow = component({
        name: 'se-slow-sibling',
        sources: { data: source({ query: () => after(8, ['a', 'b']) }) },
        view: ({ sources }: any) => jsx('p', { children: `rows:${sources.data.value.length}` }),
      });
      const html = await outcome(jsx('main', { children: [jsx(failing('se-quick-fail') as any, {}), jsx(slow as any, {})] }));

      log.push(`failed=${html.includes('id="jxe:se-quick-fail#default"')} slow=${html.includes('<p>rows:2</p>')}`);
    },
    expected: ['failed=true slow=true'],
  },
  {
    id: 'stream2-err-a-render-that-fails-still-lets-the-caller-read-the-summary',
    src: 'janux',
    run: async (log) => {
      const { chunks, done } = renderToStream(jsx('main', { children: [jsx(failing('se-summary') as any, {}), jsx(Explode as any, {})] }));

      try {
        for await (const chunk of chunks) void chunk;
      } catch {
        // The summary is the assertion.
      }
      const summary = await done;

      log.push(`islands=${summary.registry.islands.map(({ def }) => def.name).join(',')} i18n=${JSON.stringify(summary.i18nKeys)}`);
    },
    expected: ['islands=se-summary i18n=[]'],
  },
  {
    id: 'stream2-err-a-failing-island-inside-a-list-does-not-break-the-list',
    src: 'janux',
    run: async (log) => {
      const def = failing('se-row', 'row boom');
      const html = await outcome(
        jsx('ul', { children: [...Array(3).keys()].map((n) => jsx('li', { children: jsx(def as any, { key: `r${n}` }) })) }),
      );

      log.push(`items=${(html.match(/<li>/g) ?? []).length} closed=${html.endsWith('</ul>')}`);
      log.push(`reports=${(html.match(/jxe:se-row#/g) ?? []).length}`);
    },
    expected: ['items=3 closed=true', 'reports=6'],
  },
  {
    id: 'stream2-err-a-failure-inside-danger-html-siblings-leaves-the-raw-block-intact',
    src: 'janux',
    run: async (log) => {
      const { chunks } = renderToStream(
        jsx('main', { children: [jsx('div', { dangerHTML: '<b>raw</b>' }), jsx(Explode as any, { message: 'after raw' })] }),
      );
      const collected: string[] = [];

      try {
        for await (const chunk of chunks) collected.push(chunk);
      } catch (error) {
        log.push(`threw:${(error as Error).message}`);
      }
      log.push(collected.join(''));
    },
    expected: ['threw:after raw', '<main><div><b>raw</b></div></main>'],
  },
  {
    id: 'stream2-err-a-guard-inside-a-guard-only-uses-the-one-that-caught',
    src: 'janux',
    run: async (log) => {
      const inner = guarded('se-double-inner', jsx(Explode as any, { message: 'inner' }));
      const html = await outcome(jsx(guarded('se-double-outer', jsx(inner as any, {})) as any, {}));

      log.push(`inner=${html.includes('<p>caught:inner</p>')}`);
      log.push(`outer-content=${html.includes('data-jx="se-double-outer#default"><div>')}`);
    },
    expected: ['inner=true', 'outer-content=true'],
  },
  {
    id: 'stream2-err-the-error-view-renders-with-a-fresh-key-sequence',
    src: 'janux',
    run: async (log) => {
      const badge = component({ name: 'se-badge', view: () => jsx('b', { children: 'x' }) });
      const def = component({
        name: 'se-fresh',
        error: () => jsx('div', { children: jsx(badge as any, {}) }),
        view: () => jsx('div', { children: [jsx(badge as any, {}), jsx(Explode as any, {})] }),
      });
      const html = await outcome(jsx(def as any, {}));

      log.push(`key=${html.includes('data-jx="se-badge#se-fresh.default.1"')}`);
      log.push(`no-drift=${!html.includes('se-fresh.default.2')}`);
    },
    expected: ['key=true', 'no-drift=true'],
  },
  {
    id: 'stream2-err-a-mid-stream-failure-does-not-strand-the-boundary-list',
    src: 'janux',
    run: async (log) => {
      const suspended = component({
        name: 'se-strand',
        sources: { data: source({ query: () => after(10, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'real' }),
      });
      const { chunks, done } = renderToStream(jsx('main', { children: [jsx(suspended as any, {}), jsx(Explode as any, { message: 'sibling' })] }));

      try {
        for await (const chunk of chunks) void chunk;
      } catch (error) {
        log.push(`threw:${(error as Error).message}`);
      }
      await done;
      log.push('settled');
    },
    expected: ['threw:sibling', 'settled'],
  },
  {
    id: 'stream2-err-an-island-that-throws-a-non-error-still-reports-something-readable',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'se-nonerror',
        view: () => {
          throw { code: 'weird' };
        },
      });
      const html = await outcome(jsx(def as any, {}));

      log.push(`reported=${html.includes('id="jxe:se-nonerror#default"')}`);
      log.push(`detail=${html.includes('"[object Object]"')}`);
    },
    expected: ['reported=true', 'detail=true'],
  },
  {
    id: 'stream2-err-a-guard-catching-a-non-error-still-gets-the-thrown-value',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'se-nonerror-guard',
        error: ({ error }: any) => jsx('p', { children: `code:${(error as { code: string }).code}` }),
        view: () => {
          throw { code: 'weird' };
        },
      });

      log.push(await outcome(jsx(def as any, {})));
    },
    expected: ['<janux-island key="se-nonerror-guard#default" data-jx="se-nonerror-guard#default"><p>code:weird</p></janux-island>'],
  },
];
