import { component, int, jsx, renderToStream, renderToString, schema, source, store, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';
import { after, chunksOf, drained, driving, gated, settle } from './harness';

/**
 * Suspense boundaries beyond the wire format `morph-resume/stream-render`
 * already pins: which islands a boundary registers, whose snapshot ships and
 * when, what a boundary nested in another boundary does, where the fallback's
 * own subtree lives, and how the two flavours of the renderer decide whether a
 * boundary exists at all.
 *
 * The recurring theme is that a boundary is a *deferred registration*: the
 * island exists before its content does, so everything derived from the
 * registry (snapshots, island modules, the interlude) has to be correct at two
 * different moments.
 */

/** A suspended island that resolves on its own; `child` becomes its content. */
const level = (name: string, ms: number, child?: unknown) =>
  component({
    name,
    sources: { data: source({ query: () => after(ms, ['a']) }) },
    suspense: () => jsx('p', { children: `w:${name}` }),
    view: () => jsx('div', { children: child ?? jsx('p', { children: `r:${name}` }) }),
  });

/** A plain island with state — something with a snapshot worth shipping. */
const stateful = (name: string) =>
  component({ name, state: schema({ n: int() }), view: () => jsx('p', { children: name }) });

/** The boundary ids the page carries, in the order their content templates arrived. */
const ids = (html: string): string[] => (html.match(/id="jxu:([^"]+)"/g) ?? []).map((match) => match.slice('id="jxu:'.length, -1));

export const BOUNDARY_CASES: ScenarioCase[] = [
  {
    id: 'susp2-a-boundary-nested-in-another-boundarys-content-flushes-its-own-chunk',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-in', 2);
      const html = await drained(jsx('main', { children: jsx(level('sb-out', 6, jsx(inner as any, {})) as any, {}) }));

      log.push(ids(html).join(','));
    },
    expected: ['sb-out#default,sb-in#sb-out.default.1'],
  },
  {
    id: 'susp2-a-boundary-three-levels-deep-still-reaches-the-page',
    src: 'janux',
    run: async (log) => {
      const third = level('sb3-c', 2);
      const second = level('sb3-b', 3, jsx(third as any, {}));
      const html = await drained(jsx('main', { children: jsx(level('sb3-a', 4, jsx(second as any, {})) as any, {}) }));

      log.push(ids(html).join(','));
      log.push(`deepest-content=${html.includes('r:sb3-c')}`);
    },
    expected: ['sb3-a#default,sb3-b#sb3-a.default.1,sb3-c#sb3-b.sb3-a.default.1.1', 'deepest-content=true'],
  },
  {
    id: 'susp2-a-nested-boundarys-island-still-reaches-the-registry',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-reg-in', 2);
      const { chunks, done } = renderToStream(jsx('main', { children: jsx(level('sb-reg-out', 6, jsx(inner as any, {})) as any, {}) }));

      for await (const chunk of chunks) void chunk;
      const summary = await done;

      log.push(summary.registry.islands.map(({ def, key }) => `${def.name}#${key}`).join(','));
    },
    expected: ['sb-reg-out#default,sb-reg-in#sb-reg-out.default.1'],
  },
  {
    id: 'susp2-a-nested-boundarys-snapshot-ships-with-the-page',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-snap-in', 2);
      const { chunks, done } = renderToStream(jsx('main', { children: jsx(level('sb-snap-out', 6, jsx(inner as any, {})) as any, {}) }));

      for await (const chunk of chunks) void chunk;
      log.push((await done).snapshots.map(({ uri }) => uri).join(','));
    },
    expected: ['ui://sb-snap-out#default,ui://sb-snap-in#sb-snap-out.default.1'],
  },
  {
    id: 'susp2-a-plain-island-inside-a-boundarys-content-is-registered-and-snapshotted',
    src: 'janux',
    run: async (log) => {
      const child = stateful('sb-child');
      const { chunks, done } = renderToStream(jsx(level('sb-host', 4, jsx(child as any, {})) as any, {}));

      for await (const chunk of chunks) void chunk;
      const summary = await done;

      log.push(summary.registry.islands.map(({ def, key }) => `${def.name}#${key}`).join(','));
      log.push(summary.snapshots.map(({ uri }) => uri).join(','));
    },
    expected: ['sb-host#default,sb-child#sb-host.default.1', 'ui://sb-host#default,ui://sb-child#sb-host.default.1'],
  },
  {
    id: 'susp2-an-island-inside-the-fallback-never-registers-and-ships-no-snapshot',
    src: 'janux',
    run: async (log) => {
      const badge = stateful('sb-fb-badge');
      const def = component({
        name: 'sb-fb-host',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('div', { children: jsx(badge as any, {}) }),
        view: () => jsx('p', { children: 'real' }),
      });
      const { chunks, done } = renderToStream(jsx(def as any, {}));

      for await (const chunk of chunks) void chunk;
      const summary = await done;

      log.push(summary.registry.islands.map(({ def: island }) => island.name).join(','));
      log.push(summary.snapshots.map(({ uri }) => uri).join(','));
    },
    expected: ['sb-fb-host', 'ui://sb-fb-host#default'],
  },
  {
    id: 'susp2-a-suspense-island-inside-a-fallback-resolves-in-place-with-no-boundary',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-fbsusp-in', 2);
      const def = component({
        name: 'sb-fbsusp-out',
        sources: { data: source({ query: () => after(8, ['a']) }) },
        suspense: () => jsx('div', { children: jsx(inner as any, {}) }),
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx('main', { children: jsx(def as any, {}) }));

      log.push(ids(html).join(','));
      log.push(`fallback-holds-real-inner=${html.includes('r:sb-fbsusp-in')}`);
    },
    expected: ['sb-fbsusp-out#default', 'fallback-holds-real-inner=true'],
  },
  {
    id: 'susp2-the-fallbacks-island-keys-cannot-collide-with-the-contents',
    src: 'janux',
    run: async (log) => {
      const shared = stateful('sb-shared');
      const def = component({
        name: 'sb-collide',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('div', { children: jsx(shared as any, {}) }),
        view: () => jsx('div', { children: jsx(shared as any, {}) }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`fallback-key=${html.includes('data-jx="sb-shared#sb-collide.default~fb.1"')}`);
      log.push(`content-key=${html.includes('data-jx="sb-shared#sb-collide.default.1"')}`);
    },
    expected: ['fallback-key=true', 'content-key=true'],
  },
  {
    id: 'susp2-two-boundaries-of-the-same-module-take-default-and-n2-ids',
    src: 'janux',
    run: async (log) => {
      const def = level('sb-twin', 4);
      const html = await drained(jsx('main', { children: [jsx(def as any, {}), jsx(def as any, {})] }));

      log.push(ids(html).join(','));
    },
    expected: ['sb-twin#default,sb-twin#n2'],
  },
  {
    id: 'susp2-an-explicit-key-renames-the-boundary-everywhere-it-appears',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-keyed', 4) as any, { key: 'cart' }));

      log.push(`host=${html.includes('data-jx="sb-keyed#cart" data-jx-pending')}`);
      log.push(`template=${html.includes('id="jxu:sb-keyed#cart"')}`);
      log.push(`call=${html.includes('jx$u("sb-keyed#cart",document.currentScript)')}`);
      log.push(`sentinel=${html.includes('key="jxq:sb-keyed#cart"')}`);
    },
    expected: ['host=true', 'template=true', 'call=true', 'sentinel=true'],
  },
  {
    id: 'susp2-an-attacker-supplied-key-is-sanitised-before-it-reaches-the-markup',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-evil', 4) as any, { key: '"><img src=x onerror=alert(1)>' }));

      log.push(`escaped=${html.includes('id="jxu:sb-evil#___img_src_x_onerror_alert_1__"')}`);
      log.push(`no-injection=${!html.includes('<img')}`);
    },
    expected: ['escaped=true', 'no-injection=true'],
  },
  {
    id: 'susp2-five-boundaries-each-get-their-own-template-call-and-sentinel',
    src: 'janux',
    run: async (log) => {
      const def = level('sb-many', 3);
      const html = await drained(jsx('main', { children: [...Array(5).keys()].map((n) => jsx(def as any, { key: `k${n}` })) }));

      log.push(`templates=${(html.match(/<template id="jxu:sb-many#/g) ?? []).length}`);
      log.push(`calls=${(html.match(/id="jxs:sb-many#/g) ?? []).length}`);
      log.push(`sentinels=${(html.match(/key="jxq:sb-many#/g) ?? []).length}`);
      log.push(`runtimes=${html.split('self.jx$u=').length - 1}`);
    },
    expected: ['templates=5', 'calls=5', 'sentinels=5', 'runtimes=1'],
  },
  {
    id: 'susp2-a-suspended-island-marks-its-pending-host-with-persist',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-persist', 4) as any, { persist: true }));

      log.push(`pending=${html.includes('data-jx="sb-persist#default" data-jx-persist data-jx-pending')}`);
    },
    expected: ['pending=true'],
  },
  {
    id: 'susp2-a-suspended-island-marks-its-pending-host-with-eager',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-eager', 4) as any, { eager: true }));

      log.push(`pending=${html.includes('data-jx="sb-eager#default" data-jx-eager data-jx-pending')}`);
    },
    expected: ['pending=true'],
  },
  {
    id: 'susp2-a-fallback-rendering-to-nothing-leaves-an-empty-pending-host',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-nullfb',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => null,
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`empty-host=${html.includes('data-jx="sb-nullfb#default" data-jx-pending></janux-island>')}`);
      log.push(`swapped=${html.includes('<template id="sb-nullfb') || html.includes('id="jxu:sb-nullfb#default"')}`);
    },
    expected: ['empty-host=true', 'swapped=true'],
  },
  {
    id: 'susp2-content-rendering-to-nothing-swaps-in-an-empty-template',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-nullcontent',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => null,
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`empty=${html.includes('<template id="jxu:sb-nullcontent#default" key="jxt:sb-nullcontent#default"></template>')}`);
      log.push(`reported=${html.includes('janux:error')}`);
    },
    expected: ['empty=true', 'reported=false'],
  },
  {
    id: 'susp2-a-fallback-that-is-an-array-streams-every-node-into-the-host',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-arrfb',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => [jsx('i', { children: 'a' }), jsx('i', { children: 'b' })],
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`fallback=${html.includes('data-jx-pending><i>a</i><i>b</i></janux-island>')}`);
    },
    expected: ['fallback=true'],
  },
  {
    id: 'susp2-sources-that-settle-across-a-microtask-chain-still-inline',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-micro',
        sources: {
          data: source({
            query: async () => {
              await Promise.resolve();
              await Promise.resolve();

              return ['a'];
            },
          }),
        },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`inline=${html === '<janux-island key="sb-micro#default" data-jx="sb-micro#default"><p>real</p></janux-island>'}`);
    },
    expected: ['inline=true'],
  },
  {
    id: 'susp2-sources-that-need-a-macrotask-get-a-boundary',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-macro',
        sources: { data: source({ query: () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['a']))) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`boundary=${html.includes('data-jx-pending')} swap=${html.includes('id="jxu:sb-macro#default"')}`);
    },
    expected: ['boundary=true swap=true'],
  },
  {
    id: 'susp2-an-error-view-without-suspense-resolves-buffered-in-place',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-erronly',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        error: ({ error }: any) => jsx('p', { children: `bad:${(error as Error).message}` }),
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`inline=${html.includes('data-jx="sb-erronly#default"><p>real</p>')} boundary=${html.includes('data-jx-pending')}`);
    },
    expected: ['inline=true boundary=false'],
  },
  {
    id: 'susp2-an-error-view-catches-a-failure-of-an-island-nested-in-the-content',
    src: 'janux',
    run: async (log) => {
      const bad = component({ name: 'sb-nested-bad', view: () => { throw new Error('nested boom'); } });
      const def = component({
        name: 'sb-catcher',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        error: ({ error }: any) => jsx('p', { children: `caught:${(error as Error).message}` }),
        view: () => jsx('div', { children: jsx(bad as any, {}) }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`caught=${html.includes('<p>caught:nested boom</p>')} failsoft=${html.includes('id="jxe:sb-nested-bad')}`);
    },
    expected: ['caught=true failsoft=false'],
  },
  {
    id: 'susp2-an-error-view-that-throws-degrades-that-boundary-to-a-fail-soft-swap',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-errthrow',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        error: () => { throw new Error('error view boom'); },
        view: () => { throw new Error('content boom'); },
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`empty=${html.includes('<template id="jxu:sb-errthrow#default" key="jxt:sb-errthrow#default"></template>')}`);
      log.push(`reported=${html.includes('id="jxe:sb-errthrow#default"')}`);
    },
    expected: ['empty=true', 'reported=true'],
  },
  {
    id: 'susp2-a-failing-boundary-does-not-take-a-sibling-boundary-down-with-it',
    src: 'janux',
    run: async (log) => {
      const bad = component({
        name: 'sb-sib-bad',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => { throw new Error('boom'); },
      });
      const html = await drained(jsx('main', { children: [jsx(bad as any, {}), jsx(level('sb-sib-ok', 6) as any, {})] }));

      log.push(`ok-swapped=${html.includes('<p>r:sb-sib-ok</p>')} bad-reported=${html.includes('id="jxe:sb-sib-bad#default"')}`);
    },
    expected: ['ok-swapped=true bad-reported=true'],
  },
  {
    id: 'susp2-a-boundary-island-never-bubbles-its-failure-to-an-ancestor-error-view',
    src: 'janux',
    run: async (log) => {
      const inner = component({
        name: 'sb-bubble-in',
        sources: { data: source({ query: () => after(2, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => { throw new Error('inner boom'); },
      });
      const outer = component({
        name: 'sb-bubble-out',
        error: ({ error }: any) => jsx('p', { children: `outer-caught:${(error as Error).message}` }),
        view: () => jsx('div', { children: jsx(inner as any, {}) }),
      });
      const html = await drained(jsx('main', { children: jsx(outer as any, {}) }));

      log.push(`outer-intact=${html.includes('data-jx="sb-bubble-out#default"')} outer-caught=${html.includes('outer-caught')}`);
      log.push(`inner-failed-soft=${html.includes('id="jxe:sb-bubble-in')}`);
    },
    expected: ['outer-intact=true outer-caught=false', 'inner-failed-soft=true'],
  },
  {
    id: 'susp2-the-interlude-sees-only-the-islands-that-already-registered',
    src: 'janux',
    run: async (log) => {
      let seen: string[] = [];
      const page = jsx('main', { children: [jsx(stateful('sb-int-plain') as any, {}), jsx(level('sb-int-susp', 4) as any, {})] });

      await drained(page, {
        onBeforeBoundaries: (summary: any) => {
          seen = summary.registry.islands.map(({ def }: any) => def.name);

          return '';
        },
      });
      log.push(seen.join(','));
    },
    expected: ['sb-int-plain'],
  },
  {
    id: 'susp2-the-interlude-carries-the-snapshots-that-exist-at-that-moment',
    src: 'janux',
    run: async (log) => {
      let seen: string[] = [];
      const page = jsx('main', { children: [jsx(stateful('sb-snapint-plain') as any, {}), jsx(level('sb-snapint-susp', 4) as any, {})] });
      const { chunks, done } = renderToStream(page, {
        onBeforeBoundaries: (summary: any) => {
          seen = summary.snapshots.map(({ uri }: any) => uri);

          return '';
        },
      });

      for await (const chunk of chunks) void chunk;
      log.push(`interlude=${seen.join(',')}`);
      log.push(`final=${(await done).snapshots.map(({ uri }) => uri).join(',')}`);
    },
    expected: ['interlude=ui://sb-snapint-plain#default', 'final=ui://sb-snapint-plain#default,ui://sb-snapint-susp#default'],
  },
  {
    id: 'susp2-the-interlude-runs-exactly-once-however-many-boundaries-there-are',
    src: 'janux',
    run: async (log) => {
      let calls = 0;
      const def = level('sb-once', 3);

      await drained(jsx('main', { children: [...Array(4).keys()].map((n) => jsx(def as any, { key: `k${n}` })) }), {
        onBeforeBoundaries: () => {
          calls += 1;

          return '';
        },
      });
      log.push(`calls=${calls}`);
    },
    expected: ['calls=1'],
  },
  {
    id: 'susp2-an-interlude-returning-nothing-adds-nothing-to-the-stream',
    src: 'janux',
    run: async (log) => {
      const page = () => jsx('main', { children: jsx(level('sb-noint', 4) as any, {}) });
      const withHook = await drained(page(), { onBeforeBoundaries: () => '' });
      const without = await drained(page());

      log.push(`identical=${withHook === without}`);
    },
    expected: ['identical=true'],
  },
  {
    id: 'susp2-an-interlude-that-throws-fails-the-stream-instead-of-swallowing-it',
    src: 'janux',
    run: async (log) => {
      const { chunks, done } = renderToStream(jsx('main', { children: jsx(level('sb-badint', 4) as any, {}) }), {
        onBeforeBoundaries: () => {
          throw new Error('interlude boom');
        },
      });

      try {
        for await (const chunk of chunks) void chunk;
      } catch (error) {
        log.push(`threw:${(error as Error).message}`);
      }
      await done;
      log.push('done-settled');
    },
    expected: ['threw:interlude boom', 'done-settled'],
  },
  {
    id: 'susp2-snapshots-are-ordered-by-registration-not-by-document-position',
    src: 'janux',
    run: async (log) => {
      const page = jsx('main', { children: [jsx(level('sb-order-susp', 5) as any, {}), jsx(stateful('sb-order-plain') as any, {})] });
      const { chunks, done } = renderToStream(page);

      for await (const chunk of chunks) void chunk;
      log.push((await done).snapshots.map(({ uri }) => uri).join(','));
    },
    expected: ['ui://sb-order-plain#default,ui://sb-order-susp#default'],
  },
  {
    id: 'susp2-the-buffered-render-of-a-suspended-page-ships-the-settled-snapshot',
    src: 'janux',
    run: async (log) => {
      const result = await renderToString(jsx(level('sb-buffered', 4) as any, {}));

      log.push(`html=${result.html}`);
      log.push(`snapshot=${JSON.stringify(result.snapshots[0]?.sources)}`);
    },
    expected: [
      'html=<janux-island key="sb-buffered#default" data-jx="sb-buffered#default"><div><p>r:sb-buffered</p></div></janux-island>',
      'snapshot={"data":{"value":["a"]}}',
    ],
  },
  {
    id: 'susp2-inline-suspense-resolves-a-boundary-nested-inside-a-boundary-too',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-inl-in', 2);
      const html = await drained(jsx(level('sb-inl-out', 4, jsx(inner as any, {})) as any, {}), { inlineSuspense: true });

      log.push(`machinery=${html.includes('<template') || html.includes('jx$u') || html.includes('data-jx-pending')}`);
      log.push(`inner=${html.includes('r:sb-inl-in')}`);
    },
    expected: ['machinery=false', 'inner=true'],
  },
  {
    id: 'susp2-inline-suspense-still-reports-every-island-it-rendered',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-inlreg-in', 2);
      const { chunks, done } = renderToStream(jsx(level('sb-inlreg-out', 4, jsx(inner as any, {})) as any, {}), { inlineSuspense: true });

      for await (const chunk of chunks) void chunk;
      log.push((await done).registry.islands.map(({ def, key }) => `${def.name}#${key}`).join(','));
    },
    expected: ['sb-inlreg-out#default,sb-inlreg-in#sb-inlreg-out.default.1'],
  },
  {
    id: 'susp2-i18n-keys-a-boundarys-content-resolved-reach-the-summary',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-i18n',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: ({ ctx }: any) => jsx('p', { children: ctx.i18n.t('boundary.key') }),
      });
      const options = { ctx: { i18n: { locale: 'en', defaultLocale: 'en', locales: ['en'], t: (key: string) => `T:${key}` } } };
      const { chunks, done } = renderToStream(jsx(def as any, {}), options as any);

      for await (const chunk of chunks) void chunk;
      log.push(JSON.stringify((await done).i18nKeys));
    },
    expected: ['["boundary.key"]'],
  },
  {
    id: 'susp2-a-boundary-island-honours-the-initial-state-the-request-carried',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-initial',
        state: schema({ n: int() }),
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: ({ state }: any) => jsx('p', { children: `n:${state.n}` }),
      });
      const html = await drained(jsx(def as any, {}), { initialState: { 'ui://sb-initial#default': { n: 7 } } });

      log.push(`state=${html.includes('<p>n:7</p>')}`);
    },
    expected: ['state=true'],
  },
  {
    id: 'susp2-the-pending-host-and-the-settled-host-carry-the-same-identity',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-identity', 4) as any, {}));

      log.push(`host=${html.includes('<janux-island key="sb-identity#default" data-jx="sb-identity#default" data-jx-pending>')}`);
      log.push(`call-names-it=${html.includes('jx$u("sb-identity#default"')}`);
    },
    expected: ['host=true', 'call-names-it=true'],
  },
  {
    id: 'susp2-the-content-template-is-keyed-apart-from-the-id-the-runtime-looks-up',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-keys', 4) as any, {}));

      log.push(`template=${html.includes('<template id="jxu:sb-keys#default" key="jxt:sb-keys#default">')}`);
      log.push(`script=${html.includes('<script data-jxu-run id="jxs:sb-keys#default" key="jxu:sb-keys#default">')}`);
      log.push(`sentinel=${html.includes('<template data-jxs key="jxq:sb-keys#default"></template>')}`);
    },
    expected: ['template=true', 'script=true', 'sentinel=true'],
  },
  {
    id: 'susp2-a-boundary-inside-a-fragment-is-indistinguishable-from-one-in-an-element',
    src: 'janux',
    run: async (log) => {
      const html = await drained([jsx('h1', { children: 'a' }), jsx(level('sb-frag', 4) as any, {})]);

      log.push(`shell=${html.startsWith('<h1>a</h1><janux-island key="sb-frag#default"')}`);
      log.push(`swap=${html.includes('id="jxu:sb-frag#default"')}`);
    },
    expected: ['shell=true', 'swap=true'],
  },
  {
    id: 'susp2-a-boundary-that-resolves-first-does-not-wait-for-a-slower-sibling',
    src: 'janux',
    run: async (log) => {
      const slow = gated('sb-race-slow');
      const stream = driving(jsx('main', { children: [jsx(slow.def as any, {}), jsx(level('sb-race-fast', 3) as any, {})] }));

      await settle(10);
      log.push(`fast-arrived=${stream.text().includes('id="jxu:sb-race-fast#default"')}`);
      log.push(`slow-waiting=${!stream.text().includes('id="jxu:sb-race-slow#default"')}`);
      slow.release(['a']);
      await stream.finished;
    },
    expected: ['fast-arrived=true', 'slow-waiting=true'],
  },
  {
    id: 'susp2-a-cancelled-page-registers-no-boundary-island-at-all',
    src: 'janux',
    run: async (log) => {
      const gate = gated('sb-cancel-reg');
      const stream = driving(jsx('main', { children: jsx(gate.def as any, {}) }));

      await settle();
      stream.cancel();
      gate.release(['a']);
      await stream.finished;
      const summary = await stream.done;

      log.push(`islands=${summary.registry.islands.length} snapshots=${summary.snapshots.length}`);
    },
    expected: ['islands=0 snapshots=0'],
  },
  {
    id: 'susp2-a-boundary-whose-content-is-plain-text-swaps-escaped-text-in',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-text',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => 'a < b & c',
      });
      const html = await drained(jsx(def as any, {}));

      log.push(`escaped=${html.includes('<template id="jxu:sb-text#default" key="jxt:sb-text#default">a &lt; b &amp; c</template>')}`);
    },
    expected: ['escaped=true'],
  },
  {
    id: 'susp2-the-runtime-does-not-ship-when-every-boundary-resolved-inline',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-noruntime',
        sources: { data: source({ query: async () => ['a'] }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx('main', { children: [jsx(def as any, {}), jsx(def as any, {})] }));

      log.push(`runtime=${html.includes('self.jx$u=')} scripts=${html.includes('<script')}`);
    },
    expected: ['runtime=false scripts=false'],
  },
  {
    id: 'susp2-a-boundary-in-a-list-item-keeps-its-list-well-formed-while-pending',
    src: 'janux',
    run: async (log) => {
      const def = level('sb-list', 4);
      const chunks = await chunksOf(jsx('ul', { children: [...Array(3).keys()].map((n) => jsx('li', { children: jsx(def as any, { key: `i${n}` }) })) }));
      const shell = chunks[0]!;

      log.push(`closed=${shell.includes('</ul>')}`);
      log.push(`items=${(shell.match(/<li>/g) ?? []).length}`);
    },
    expected: ['closed=true', 'items=3'],
  },
  {
    id: 'susp2-a-boundary-inside-a-guarded-sibling-does-not-outlive-its-discarded-host',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-guard-in', 4);
      const guarded = component({
        name: 'sb-guard-out',
        error: () => jsx('p', { children: 'guarded' }),
        view: () => jsx('div', { children: [jsx(inner as any, {}), jsx(() => { throw new Error('discard'); }, {})] }),
      });
      const html = await drained(jsx('main', { children: jsx(guarded as any, {}) }));

      log.push(`error-view=${html.includes('<p>guarded</p>')}`);
      log.push(`orphan-boundary=${html.includes('id="jxu:sb-guard-in')}`);
    },
    expected: ['error-view=true', 'orphan-boundary=false'],
  },
  {
    id: 'susp2-the-swap-script-is-marked-so-the-navigation-runner-can-find-it',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-marked', 4) as any, {}));

      log.push(`marker=${html.includes('<script data-jxu-run ')}`);
      log.push(`self-removing=${html.includes('document.currentScript)')}`);
    },
    expected: ['marker=true', 'self-removing=true'],
  },
  {
    id: 'susp2-a-boundary-whose-content-holds-a-nested-island-array-keys-them-in-order',
    src: 'janux',
    run: async (log) => {
      const a = stateful('sb-seq-a');
      const b = stateful('sb-seq-b');
      const host = component({
        name: 'sb-seq-host',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('div', { children: [jsx(a as any, {}), jsx(b as any, {})] }),
      });
      const { chunks, done } = renderToStream(jsx(host as any, {}));

      for await (const chunk of chunks) void chunk;
      log.push((await done).registry.islands.map(({ def, key }) => `${def.name}#${key}`).join(','));
    },
    expected: ['sb-seq-host#default,sb-seq-a#sb-seq-host.default.1,sb-seq-b#sb-seq-host.default.1'],
  },
  {
    id: 'susp2-the-fallback-of-a-boundary-nested-in-a-boundary-lands-inside-the-outer-template',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-fbnest-in', 4);
      const html = await drained(jsx(level('sb-fbnest-out', 2, jsx(inner as any, {})) as any, {}));
      const outerTemplate = html.indexOf('<template id="jxu:sb-fbnest-out#default"');
      const innerFallback = html.indexOf('w:sb-fbnest-in');
      const innerTemplate = html.indexOf('<template id="jxu:sb-fbnest-in');

      log.push(`fallback-inside-outer=${innerFallback > outerTemplate}`);
      log.push(`inner-swap-after=${innerTemplate > innerFallback}`);
    },
    expected: ['fallback-inside-outer=true', 'inner-swap-after=true'],
  },
  {
    id: 'susp2-two-boundaries-resolving-in-the-same-tick-both-flush',
    src: 'janux',
    run: async (log) => {
      const first = gated('sb-same-a');
      const second = gated('sb-same-b');
      const stream = driving(jsx('main', { children: [jsx(first.def as any, {}), jsx(second.def as any, {})] }));

      await settle();
      first.release(['a']);
      second.release(['b']);
      await stream.finished;
      log.push(ids(stream.text()).sort().join(','));
    },
    expected: ['sb-same-a#default,sb-same-b#default'],
  },
  {
    id: 'susp2-a-boundary-that-fails-still-lets-the-next-boundary-ship-the-runtime',
    src: 'janux',
    run: async (log) => {
      const bad = component({
        name: 'sb-first-bad',
        sources: { data: source({ query: () => after(2, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => { throw new Error('boom'); },
      });
      const html = await drained(jsx('main', { children: [jsx(bad as any, {}), jsx(level('sb-second-ok', 6) as any, {})] }));

      log.push(`runtimes=${html.split('self.jx$u=').length - 1}`);
      log.push(`runtime-before-second=${html.indexOf('self.jx$u=') < html.indexOf('id="jxs:sb-second-ok#default"')}`);
    },
    expected: ['runtimes=1', 'runtime-before-second=true'],
  },
  {
    id: 'susp2-a-store-backed-boundary-island-resolves-its-store-before-it-suspends',
    src: 'janux',
    run: async (log) => {
      const settings = store({ name: 'sb-settings', state: schema({ theme: str().default('dark') }), intents: {} });
      const def = component({
        name: 'sb-store-user',
        use: { settings },
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: ({ use }: any) => jsx('p', { children: `theme:${use.settings.state.theme}` }),
      });
      const html = await drained(jsx(def as any, {}), { storeDefs: { settings } });

      log.push(`swapped=${html.includes('<template id="jxu:sb-store-user#default" key="jxt:sb-store-user#default"><p>theme:dark</p></template>')}`);
    },
    expected: ['swapped=true'],
  },
  {
    id: 'susp2-a-missing-store-alias-fails-the-island-before-it-can-suspend',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-store-missing',
        use: { absent: {} as any },
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'real' }),
      });

      try {
        await drained(jsx('main', { children: jsx(def as any, {}) }));
        log.push('no-throw');
      } catch (error) {
        log.push(`named=${(error as Error).message.includes('store "absent" used by island "sb-store-missing" is not registered')}`);
      }
    },
    expected: ['named=true'],
  },
  {
    id: 'susp2-a-boundary-page-renders-identically-twice-in-a-row',
    src: 'janux',
    run: async (log) => {
      const page = () => jsx('main', { children: [jsx(level('sb-det-a', 3) as any, {}), jsx(level('sb-det-b', 3) as any, {})] });
      const first = await drained(page());
      const second = await drained(page());

      log.push(`identical=${first === second}`);
    },
    expected: ['identical=true'],
  },
  {
    id: 'susp2-a-suspended-island-nested-in-a-plain-islands-content-still-gets-a-boundary',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-under-plain-in', 4);
      const outer = component({ name: 'sb-under-plain-out', view: () => jsx('div', { children: jsx(inner as any, {}) }) });
      const html = await drained(jsx('main', { children: jsx(outer as any, {}) }));

      log.push(ids(html).join(','));
      log.push(`fallback=${html.includes('<p>w:sb-under-plain-in</p>')}`);
    },
    expected: ['sb-under-plain-in#sb-under-plain-out.default.1', 'fallback=true'],
  },
  {
    id: 'susp2-a-boundary-and-a-plain-island-of-one-module-share-the-key-sequence',
    src: 'janux',
    run: async (log) => {
      const def = level('sb-mixedkeys', 4);
      const html = await drained(jsx('main', { children: [jsx(def as any, {}), jsx(def as any, {})] }));

      log.push(ids(html).sort().join(','));
    },
    expected: ['sb-mixedkeys#default,sb-mixedkeys#n2'],
  },
  {
    id: 'susp2-only-the-island-that-lost-the-race-gets-a-boundary-chunk',
    src: 'janux',
    run: async (log) => {
      const quick = component({
        name: 'sb-race-inline',
        sources: { data: source({ query: async () => ['a'] }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'inline' }),
      });
      const html = await drained(jsx('main', { children: [jsx(quick as any, {}), jsx(level('sb-race-boundary', 5) as any, {})] }));

      log.push(ids(html).join(','));
      log.push(`inline-in-shell=${html.indexOf('<p>inline</p>') < html.indexOf('</main>')}`);
    },
    expected: ['sb-race-boundary#default', 'inline-in-shell=true'],
  },
  {
    id: 'susp2-inline-suspense-suppresses-the-interlude-hook-entirely',
    src: 'janux',
    run: async (log) => {
      let calls = 0;

      await drained(jsx(level('sb-inline-int', 4) as any, {}), {
        inlineSuspense: true,
        onBeforeBoundaries: () => {
          calls += 1;

          return '<!--never-->';
        },
      });
      log.push(`calls=${calls}`);
    },
    expected: ['calls=0'],
  },
  {
    id: 'susp2-the-buffered-render-never-reaches-the-interlude-hook',
    src: 'janux',
    run: async (log) => {
      let calls = 0;

      await renderToString(jsx(level('sb-buffered-int', 4) as any, {}), {
        onBeforeBoundaries: () => {
          calls += 1;

          return '<!--never-->';
        },
      } as any);
      log.push(`calls=${calls}`);
    },
    expected: ['calls=0'],
  },
  {
    id: 'susp2-a-suspended-islands-initial-state-prop-survives-the-deferral',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-initial-prop',
        state: schema({ n: int() }),
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: ({ state }: any) => jsx('p', { children: `n:${state.n}` }),
      });
      const html = await drained(jsx(def as any, { initial: { n: 12 } }));

      log.push(`state=${html.includes('<p>n:12</p>')}`);
    },
    expected: ['state=true'],
  },
  {
    id: 'susp2-the-sentinel-template-is-empty-so-a-parser-can-ignore-it',
    src: 'janux',
    run: async (log) => {
      const html = await drained(jsx(level('sb-inert', 4) as any, {}));
      const sentinel = /<template data-jxs key="jxq:sb-inert#default">(.*?)<\/template>/s.exec(html);

      log.push(`found=${sentinel !== null} content=${JSON.stringify(sentinel?.[1])}`);
    },
    expected: ['found=true content=""'],
  },
  {
    id: 'susp2-a-fallback-with-a-nested-element-tree-closes-inside-the-shell',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-treefb',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: () => jsx('div', { children: jsx('ul', { children: [jsx('li', { children: '1' }), jsx('li', { children: '2' })] }) }),
        view: () => jsx('p', { children: 'real' }),
      });
      const chunks = await chunksOf(jsx('main', { children: jsx(def as any, {}) }));

      log.push(`shell=${chunks[0]}`);
    },
    expected: [
      'shell=<main><janux-island key="sb-treefb#default" data-jx="sb-treefb#default" data-jx-pending><div><ul><li>1</li><li>2</li></ul></div></janux-island></main>',
    ],
  },
  {
    id: 'susp2-a-boundary-inside-a-table-cell-keeps-the-table-parseable-while-pending',
    src: 'janux',
    run: async (log) => {
      const chunks = await chunksOf(
        jsx('table', { children: jsx('tbody', { children: jsx('tr', { children: jsx('td', { children: jsx(level('sb-cell', 4) as any, {}) }) }) }) }),
      );

      log.push(`shell-closed=${chunks[0]!.endsWith('</td></tr></tbody></table>')}`);
      log.push(`swap-outside=${chunks.slice(1).join('').startsWith('<template id="jxu:sb-cell#default"')}`);
    },
    expected: ['shell-closed=true', 'swap-outside=true'],
  },
  {
    id: 'susp2-a-boundary-nested-in-a-fallback-of-another-boundary-never-flushes',
    src: 'janux',
    run: async (log) => {
      const buried = level('sb-buried', 4);
      const def = component({
        name: 'sb-burier',
        sources: { data: source({ query: () => after(8, ['a']) }) },
        suspense: () => jsx('div', { children: jsx(buried as any, {}) }),
        view: () => jsx('p', { children: 'real' }),
      });
      const html = await drained(jsx(def as any, {}));

      log.push(ids(html).join(','));
      log.push(`buried-resolved-in-place=${html.includes('r:sb-buried')}`);
    },
    expected: ['sb-burier#default', 'buried-resolved-in-place=true'],
  },
  {
    id: 'susp2-a-nested-boundarys-snapshot-carries-the-sources-it-settled-with',
    src: 'janux',
    run: async (log) => {
      const inner = level('sb-nsnap-in', 2);
      const { chunks, done } = renderToStream(jsx(level('sb-nsnap-out', 5, jsx(inner as any, {})) as any, {}));

      for await (const chunk of chunks) void chunk;
      const summary = await done;

      log.push(summary.snapshots.map(({ uri, sources }) => `${uri}=${JSON.stringify(sources)}`).join(' | '));
    },
    expected: [
      'ui://sb-nsnap-out#default={"data":{"value":["a"]}} | ui://sb-nsnap-in#sb-nsnap-out.default.1={"data":{"value":["a"]}}',
    ],
  },
  {
    id: 'susp2-four-boundaries-produce-four-chunks-and-one-runtime-however-they-interleave',
    src: 'janux',
    run: async (log) => {
      const gates = [...Array(4).keys()].map((n) => gated(`sb-inter-${n}`));
      const stream = driving(jsx('main', { children: gates.map(({ def }) => jsx(def as any, {})) }));

      await settle();
      gates[2]!.release(['a']);
      await settle();
      gates[0]!.release(['a']);
      gates[3]!.release(['a']);
      await settle();
      gates[1]!.release(['a']);
      await stream.finished;
      const html = stream.text();

      log.push(ids(html).join(','));
      log.push(`runtimes=${html.split('self.jx$u=').length - 1}`);
    },
    expected: ['sb-inter-2#default,sb-inter-0#default,sb-inter-3#default,sb-inter-1#default', 'runtimes=1'],
  },
  {
    id: 'susp2-a-boundary-whose-fallback-uses-i18n-records-those-keys-too',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'sb-fbi18n',
        sources: { data: source({ query: () => after(4, ['a']) }) },
        suspense: ({ ctx }: any) => jsx('p', { children: ctx.i18n.t('fallback.key') }),
        view: ({ ctx }: any) => jsx('p', { children: ctx.i18n.t('content.key') }),
      });
      const options = { ctx: { i18n: { locale: 'en', defaultLocale: 'en', locales: ['en'], t: (key: string) => `T:${key}` } } };
      const { chunks, done } = renderToStream(jsx(def as any, {}), options as any);

      for await (const chunk of chunks) void chunk;
      log.push(JSON.stringify((await done).i18nKeys.sort()));
    },
    expected: ['["content.key","fallback.key"]'],
  },
  {
    id: 'susp2-returning-from-the-chunk-loop-is-not-a-cancel-and-still-waits-for-the-boundary',
    src: 'janux',
    run: async (log) => {
      const viaReturn = renderToStream(jsx('main', { children: jsx(level('sb-return', 20) as any, {}) }));

      await viaReturn.chunks.next();
      // The generator protocol cannot reach a renderer parked on its own await:
      // it only resumes when the boundary resolves, by which time the island
      // has registered. `cancel()` is the seam that actually abandons the work.
      await viaReturn.chunks.return(undefined);
      log.push(`returned=${(await viaReturn.done).registry.islands.length}`);

      const viaCancel = renderToStream(jsx('main', { children: jsx(level('sb-cancelled', 20) as any, {}) }));

      await viaCancel.chunks.next();
      viaCancel.cancel();
      log.push(`cancelled=${(await viaCancel.done).registry.islands.length}`);
    },
    expected: ['returned=1', 'cancelled=0'],
  },
  {
    id: 'susp2-cancelling-a-drained-stream-afterwards-changes-nothing',
    src: 'janux',
    run: async (log) => {
      const { chunks, done, cancel } = renderToStream(jsx(level('sb-late-cancel', 3) as any, {}));
      const collected: string[] = [];

      for await (const chunk of chunks) collected.push(chunk);
      const before = collected.join('');

      cancel();
      const summary = await done;

      log.push(`complete=${before.includes('r:sb-late-cancel')} islands=${summary.registry.islands.length}`);
    },
    expected: ['complete=true islands=1'],
  },
  {
    id: 'susp2-a-page-of-only-inline-resolved-boundaries-needs-no-interlude-and-no-runtime',
    src: 'janux',
    run: async (log) => {
      const quick = component({
        name: 'sb-alldone',
        sources: { data: source({ query: async () => ['a'] }) },
        suspense: () => jsx('p', { children: 'w' }),
        view: () => jsx('p', { children: 'done' }),
      });
      let interludes = 0;
      const html = await drained(jsx('main', { children: [jsx(quick as any, {}), jsx(quick as any, {}), jsx(quick as any, {})] }), {
        onBeforeBoundaries: () => {
          interludes += 1;

          return '<!--x-->';
        },
      });

      log.push(`interludes=${interludes} runtime=${html.includes('self.jx$u=')}`);
      log.push(`content=${(html.match(/<p>done<\/p>/g) ?? []).length}`);
    },
    expected: ['interludes=0 runtime=false', 'content=3'],
  },
];
