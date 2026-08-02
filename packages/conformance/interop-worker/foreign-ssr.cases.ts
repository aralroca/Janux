import { component, Fragment, int, intent, jsx, renderToStream, renderToString, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { createElement } from 'react';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Server rendering a foreign island.
 *
 * The host element is the contract: the morph treats it as an opaque leaf, the
 * client looks it up by `data-jx`, and its content is whatever the foreign
 * runtime produced — or nothing, when there is no runtime to produce it.
 *
 * "Or nothing" is exactly where this used to lie. A component that threw and a
 * component whose runtime was never installed emitted the same empty host, so
 * the single most common interop mistake (a file compiled with Janux's JSX
 * runtime, handing React a Janux node) looked like a supported configuration.
 * Absent is allowed; silently replaced is not.
 */

function Gauge({ level, label }: { level?: number; label?: string }) {
  return createElement('output', { className: 'gauge' }, `${label ?? 'vol'}:${level ?? 0}`);
}

function Boom(): never {
  throw new Error('kaboom');
}

/** A foreign subtree with a link in it: localisation must not rewrite this one. */
function Linky() {
  return createElement('a', { href: '/docs' }, 'docs');
}

/** The @jsxImportSource trap: Janux's runtime compiled into a React component. */
function JanuxRuntime() {
  return jsx('b', { children: 'wrong' }) as never;
}

const GaugeIsland = foreign(Gauge, { name: 'gauge' });
const html = async (node: unknown, options: Record<string, unknown> = {}) =>
  (await renderToString(node, options as never)).html;

/** The text a foreign component rendered, without the host markup around it. */
const text = (markup: string) => markup.replace(/<[^>]*>/g, '');

const shell = component({
  name: 'shell',
  description: 'Shell',
  state: schema({ level: int().default(2), label: str().default('vol') }),
  intents: { up: intent({ description: 'Up', run: ({ state }) => (state.level += 1) }) },
  view: (bag) => jsx('section', { children: jsx(GaugeIsland as never, { state: bag.state }) }),
});

/** A runtime that is simply not installed, in each wording a loader uses. */
const missing = (message: string) => () => Promise.reject(new Error(message));
const missingCode = () => () =>
  Promise.reject(Object.assign(new Error('boom'), { code: 'ERR_MODULE_NOT_FOUND' }));

export const FOREIGN_SSR_CASES: ScenarioCase[] = [
  // ── the host element ────────────────────────────────────────────────────────
  {
    id: 'foreign-ssr-renders-the-component-inside-an-opaque-host',
    src: 'janux',
    run: async (log) => {
      log.push(await html(jsx(GaugeIsland as never, { level: 2 })));
    },
    expected: [
      '<janux-foreign data-jx="gauge#default" data-jxf-hydrate="load" data-jxf-props="{&quot;level&quot;:2}"><output class="gauge">vol:2</output></janux-foreign>',
    ],
  },
  {
    id: 'foreign-ssr-names-the-host-after-the-island-not-the-component',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(foreign(Gauge, { name: 'speedo' }) as never, {}));

      log.push(markup.slice(0, markup.indexOf('data-jxf-hydrate')).trim());
    },
    expected: ['<janux-foreign data-jx="speedo#default"'],
  },
  {
    id: 'foreign-ssr-escapes-a-hostile-island-name-in-the-id',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(foreign(Gauge, { name: 'a"><script>' }) as never, {}));

      log.push(markup.slice(0, markup.indexOf(' data-jxf-hydrate')));
    },
    expected: ['<janux-foreign data-jx="a&quot;&gt;&lt;script&gt;#default"'],
  },
  {
    id: 'foreign-ssr-carries-the-hydrate-directive-onto-the-host',
    src: 'janux',
    run: async (log) => {
      for (const hydrate of ['load', 'idle', 'visible'] as const) {
        const markup = await html(jsx(foreign(Gauge, { name: 'g', hydrate }) as never, {}));

        log.push(markup.match(/data-jxf-hydrate="([a-z]+)"/)![1]!);
      }
    },
    expected: ['load', 'idle', 'visible'],
  },
  {
    id: 'foreign-ssr-hydrate-only-emits-an-empty-host-and-never-runs-the-component',
    src: 'janux',
    run: async (log) => {
      let runs = 0;
      const Counted = () => {
        runs += 1;

        return createElement('b', null, 'x');
      };

      log.push(await html(jsx(foreign(Counted, { name: 'only', hydrate: 'only' }) as never, {})), `runs=${runs}`);
    },
    expected: ['<janux-foreign data-jx="only#default" data-jxf-hydrate="only" data-jxf-props="{}"></janux-foreign>', 'runs=0'],
  },
  {
    id: 'foreign-ssr-marks-a-persisted-host',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(GaugeIsland as never, { persist: true }));

      log.push(String(markup.includes('data-jx-persist')));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-ssr-drops-the-children-of-a-foreign-tag',
    src: 'janux',
    run: async (log) => {
      // The foreign runtime owns everything inside the host; Janux children
      // written at the call site would be overwritten on hydration anyway.
      const markup = await html(jsx(GaugeIsland as never, { children: jsx('i', { children: 'slot' }) }));

      log.push(String(markup.includes('<i>')), String(markup.includes('data-jxf-props="{}"')));
    },
    expected: ['false', 'true'],
  },

  // ── ids: what the client looks the host up by ───────────────────────────────
  {
    id: 'foreign-ssr-gives-two-siblings-of-the-same-island-distinct-ids',
    src: 'janux',
    run: async (log) => {
      const markup = await html(
        jsx('main', { children: [jsx(GaugeIsland as never, {}), jsx(GaugeIsland as never, {})] }),
      );

      log.push([...markup.matchAll(/data-jx="([^"]+)"/g)].map((match) => match[1]!).join(' '));
    },
    expected: ['gauge#default gauge#n2'],
  },
  {
    id: 'foreign-ssr-uses-an-explicit-key-in-the-id',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx('main', { children: jsx(GaugeIsland as never, {}, 'left') }));

      log.push(markup.match(/data-jx="([^"]+)"/)![1]!);
    },
    expected: ['gauge#left'],
  },
  {
    id: 'foreign-ssr-uses-an-explicit-id-prop-in-the-id',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx('main', { children: jsx(GaugeIsland as never, { id: 'right' }) }));

      log.push(markup.match(/data-jx="([^"]+)"/)![1]!);
    },
    expected: ['gauge#right'],
  },
  {
    id: 'foreign-ssr-scopes-the-id-of-a-foreign-inside-an-island',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(shell as never, {}));

      log.push(markup.match(/janux-foreign data-jx="([^"]+)"/)![1]!);
    },
    // The sweep that unmounts orphaned React roots matches on this prefix.
    expected: ['gauge#shell.default.1'],
  },
  {
    id: 'foreign-ssr-renders-one-host-per-item-of-a-list',
    src: 'janux',
    run: async (log) => {
      const markup = await html(
        jsx('ul', { children: ['a', 'b', 'c'].map((label) => jsx(GaugeIsland as never, { label })) }),
      );

      log.push(String([...markup.matchAll(/<janux-foreign/g)].length), String([...new Set(markup.match(/data-jx="[^"]+"/g))].length));
    },
    expected: ['3', '3'],
  },

  // ── the call-site props that travel with the host ───────────────────────────
  {
    id: 'foreign-ssr-serializes-top-level-call-site-props-onto-the-host',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(GaugeIsland as never, { level: 9, label: 'top' }));

      log.push(markup.match(/data-jxf-props="([^"]*)"/)![1]!);
    },
    expected: ['{&quot;level&quot;:9,&quot;label&quot;:&quot;top&quot;}'],
  },
  {
    id: 'foreign-ssr-omits-call-site-props-for-a-foreign-inside-an-island',
    src: 'janux',
    run: async (log) => {
      // Inside an island the props come from the island's own re-render, and
      // the state proxy they are read from does not serialize anyway.
      log.push(String((await html(jsx(shell as never, {}))).includes('data-jxf-props')));
    },
    expected: ['false'],
  },
  {
    id: 'foreign-ssr-escapes-hostile-text-in-the-serialized-props',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(GaugeIsland as never, { label: '"><img src=x onerror=alert(1)>' }));

      log.push(String(markup.includes('<img')), markup.match(/data-jxf-props="([^"]*)"/)![1]!);
    },
    expected: [
      'false',
      '{&quot;label&quot;:&quot;\\&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&quot;}',
    ],
  },
  {
    id: 'foreign-ssr-omits-the-props-attribute-when-a-prop-cannot-be-serialized',
    src: 'janux',
    run: async (log) => {
      // A BigInt makes `JSON.stringify` throw: the host still renders, it just
      // cannot be hydrated from markup alone.
      const markup = await html(jsx(GaugeIsland as never, { total: 1n }));

      log.push(String(markup.includes('data-jxf-props')));
    },
    expected: ['false'],
  },
  {
    id: 'foreign-ssr-drops-a-callback-prop-from-the-serialized-props',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(GaugeIsland as never, { level: 1, onPick: () => undefined }));

      log.push(markup.match(/data-jxf-props="([^"]*)"/)![1]!);
    },
    expected: ['{&quot;level&quot;:1}'],
  },

  // ── the props mapper ────────────────────────────────────────────────────────
  {
    id: 'foreign-ssr-passes-call-site-props-through-the-mapper',
    src: 'janux',
    run: async (log) => {
      const Mapped = foreign(Gauge, { name: 'mapped', props: (own) => ({ level: (own.n as number) * 2 }) });

      log.push(text(await html(jsx(Mapped as never, { n: 4 }))));
    },
    expected: ['vol:8'],
  },
  {
    id: 'foreign-ssr-without-a-mapper-hands-the-call-site-props-straight-over',
    src: 'janux',
    run: async (log) => {
      log.push(text(await html(jsx(GaugeIsland as never, { level: 3, label: 'raw' }))));
    },
    expected: ['raw:3'],
  },
  {
    id: 'foreign-ssr-a-mapper-that-throws-names-the-island',
    src: 'janux',
    run: async (log) => {
      const Broken = foreign(Gauge, {
        name: 'broken-map',
        props: () => {
          throw new Error('mapper exploded');
        },
      });

      await attempt(log, 'render', () => html(jsx(Broken as never, {})));
    },
    expected: [
      "render:threw:Janux: foreign <broken-map> failed to server-render. mapper exploded. Set `hydrate: 'only'` to skip SSR for this island.",
    ],
  },
  {
    id: 'foreign-ssr-a-mapper-never-runs-when-ssr-is-skipped',
    src: 'janux',
    run: async (log) => {
      const Broken = foreign(Gauge, {
        name: 'skipped-map',
        hydrate: 'only',
        props: () => {
          throw new Error('mapper exploded');
        },
      });

      await attempt(log, 'render', () => html(jsx(Broken as never, {})));
    },
    expected: ['render:ok'],
  },
  {
    id: 'foreign-ssr-does-not-pass-event-bindings-to-the-server-render',
    src: 'janux',
    run: async (log) => {
      // There is nothing to click during SSR, so callbacks exist only on the
      // client — a component that calls one while rendering must see undefined.
      const Reader = ({ onPick }: { onPick?: () => void }) =>
        createElement('output', null, String(typeof onPick));
      const Island = foreign(Reader, { name: 'reader', on: { onPick: 'pick' } });

      log.push(text(await html(jsx(Island as never, {}))));
    },
    expected: ['undefined'],
  },

  // ── the props boundary, on the server too ───────────────────────────────────
  {
    id: 'foreign-ssr-a-component-that-freezes-its-props-leaves-state-writable',
    src: 'janux',
    run: async (log) => {
      const Freezer = ({ rows }: { rows: { id: string }[] }) => {
        Object.freeze(rows);

        return createElement('output', null, rows.map((row) => row.id).join(','));
      };
      const Island = foreign(Freezer, { name: 'freezer', props: (own) => ({ rows: own.rows }) });
      const rows = [{ id: 'a' }];

      log.push(text(await html(jsx(Island as never, { rows }))));
      rows.push({ id: 'b' });
      log.push(`writable=${rows.length}`);
    },
    expected: ['a', 'writable=2'],
  },
  {
    id: 'foreign-ssr-hands-a-date-prop-over-as-a-date',
    src: 'janux',
    run: async (log) => {
      const Stamp = ({ when }: { when: Date }) => createElement('output', null, when.toISOString());
      const Island = foreign(Stamp, { name: 'stamp', props: () => ({ when: new Date('2020-01-02T03:04:05Z') }) });

      log.push(text(await html(jsx(Island as never, {}))));
    },
    expected: ['2020-01-02T03:04:05.000Z'],
  },
  {
    id: 'foreign-ssr-hands-a-react-element-prop-over-unchanged',
    src: 'janux',
    run: async (log) => {
      const slot = createElement('i', null, 'slot');
      const Wrapper = ({ node }: { node: unknown }) => createElement('div', null, node as never);
      const Island = foreign(Wrapper, { name: 'wrapper', props: () => ({ node: slot }) });

      log.push((await html(jsx(Island as never, {}))).match(/<div>(.*)<\/div>/)![1]!);
    },
    expected: ['<i>slot</i>'],
  },

  // ── failure: absent is allowed, silently replaced is not ────────────────────
  {
    id: 'foreign-ssr-a-missing-react-package-leaves-a-quiet-empty-host',
    src: 'janux',
    run: async (log) => {
      log.push(await html(jsx(GaugeIsland as never, {}), { foreignImport: missing("Cannot find package 'react' from x") }));
    },
    expected: ['<janux-foreign data-jx="gauge#default" data-jxf-hydrate="load" data-jxf-props="{}"></janux-foreign>'],
  },
  {
    id: 'foreign-ssr-a-module-not-found-code-also-leaves-a-quiet-empty-host',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(GaugeIsland as never, {}), { foreignImport: missingCode() });

      log.push(String(markup.includes('<output')));
    },
    expected: ['false'],
  },
  {
    id: 'foreign-ssr-a-missing-react-dom-server-is-the-same-absent-runtime',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(GaugeIsland as never, {}), {
        foreignImport: (spec: string) =>
          spec === 'react' ? import('react') : Promise.reject(new Error("Cannot find module 'react-dom/server'")),
      });

      log.push(String(markup.includes('<output')));
    },
    expected: ['false'],
  },
  {
    id: 'foreign-ssr-a-loader-that-fails-for-any-other-reason-is-reported',
    src: 'janux',
    run: async (log) => {
      // "The runtime is not installed" is one specific, documented outcome; a
      // loader that blew up for its own reasons is not that outcome.
      await attempt(log, 'render', () => html(jsx(GaugeIsland as never, {}), { foreignImport: missing('EACCES: permission denied') }));
    },
    expected: [
      "render:threw:Janux: foreign <gauge> failed to server-render. EACCES: permission denied. Set `hydrate: 'only'` to skip SSR for this island.",
    ],
  },
  {
    id: 'foreign-ssr-a-component-that-throws-is-reported-not-blanked',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'render', () => html(jsx(foreign(Boom, { name: 'boom' }) as never, {})));
    },
    expected: [
      "render:threw:Janux: foreign <boom> failed to server-render. kaboom. Set `hydrate: 'only'` to skip SSR for this island.",
    ],
  },
  {
    id: 'foreign-ssr-a-janux-jsx-runtime-component-is-diagnosed-by-name',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'render', () => html(jsx(foreign(JanuxRuntime, { name: 'wrong-runtime' }) as never, {})));
    },
    expected: [
      'render:threw:Janux: foreign <wrong-runtime> failed to server-render — it returned a Janux node, not a React element: add `/** @jsxImportSource react */` at the top of the file that defines it (or set `jsxImportSource` for it in tsconfig). Objects are not valid as a React child (found: object with keys {$t, $p, $k}). If you meant to render a collection of children, use an array instead. Set `hydrate: \'only\'` to skip SSR for this island.',
    ],
  },
  {
    id: 'foreign-ssr-an-undefined-component-is-reported-not-blanked',
    src: 'janux',
    run: async (log) => {
      // The circular-import classic: `foreign(undefined)` at module scope.
      await attempt(log, 'render', () => html(jsx(foreign(undefined, { name: 'nothing' }) as never, {})));
    },
    expected: [
      "render:threw:Janux: foreign <nothing> failed to server-render. Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports. Set `hydrate: 'only'` to skip SSR for this island.",
    ],
  },
  {
    id: 'foreign-ssr-skipping-ssr-is-the-documented-escape-from-a-render-that-cannot-work',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(foreign(Boom, { name: 'boom-only', hydrate: 'only' }) as never, {}));

      log.push(markup);
    },
    expected: ['<janux-foreign data-jx="boom-only#default" data-jxf-hydrate="only" data-jxf-props="{}"></janux-foreign>'],
  },
  {
    id: 'foreign-ssr-a-throwing-foreign-inside-an-island-becomes-the-island-failure',
    src: 'janux',
    run: async (log) => {
      const broken = component({
        name: 'broken-shell',
        description: 'Broken',
        state: schema({ a: str().default('') }),
        intents: {},
        view: () => jsx(foreign(Boom, { name: 'inner-boom' }) as never, {}),
      });
      const markup = await html(jsx(broken as never, {}));

      // The island's own fail-soft path owns it from here: the page still
      // renders, and the failure is announced instead of being a blank box.
      log.push(String(markup.includes('id="jxe:broken-shell#default"')), String(markup.includes('inner-boom')));
    },
    expected: ['true', 'true'],
  },

  // ── the agent surface stays clean ───────────────────────────────────────────
  {
    id: 'foreign-ssr-a-foreign-island-is-not-part-of-the-agent-surface',
    src: 'janux',
    run: async (log) => {
      const { registry } = await renderToString(jsx(shell as never, {}), {});

      log.push(registry.islands.map(({ def }) => def.name).join(','));
    },
    // Opaque by design (RFC §1.5): a foreign subtree has no declared intents,
    // so advertising it would advertise something no agent can drive.
    expected: ['shell'],
  },
  {
    id: 'foreign-ssr-a-foreign-island-produces-no-state-snapshot',
    src: 'janux',
    run: async (log) => {
      const { snapshots } = await renderToString(jsx(GaugeIsland as never, { level: 1 }), {});

      log.push(String(snapshots.length));
    },
    expected: ['0'],
  },
  {
    id: 'foreign-ssr-a-foreign-host-renders-inside-a-stream-in-one-piece',
    src: 'janux',
    run: async (log) => {
      const { html: markup } = await renderToString(jsx('main', { children: jsx(GaugeIsland as never, { level: 5 }) }), {});

      log.push(String(markup.indexOf('<janux-foreign') < markup.indexOf('vol:5')), String(markup.endsWith('</janux-foreign></main>')));
    },
    expected: ['true', 'true'],
  },

  // ── where else a foreign island can sit ─────────────────────────────────────
  {
    id: 'foreign-ssr-renders-a-foreign-inside-a-fragment',
    src: 'janux',
    run: async (log) => {
      const markup = await html(jsx(Fragment, { children: [jsx('b', { children: 'x' }), jsx(GaugeIsland as never, { level: 1 })] }));

      log.push(String(markup.startsWith('<b>x</b><janux-foreign')));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-ssr-keeps-the-ids-of-a-keyed-list-stable-across-two-renders',
    src: 'janux',
    run: async (log) => {
      // The client matches hosts by id across a navigation: ids that shift when
      // the list is re-rendered would tear down every React root on the page.
      const page = () =>
        html(jsx('ul', { children: ['a', 'b'].map((key) => jsx(GaugeIsland as never, { label: key }, key)) }));
      const ids = async () => [...(await page()).matchAll(/data-jx="([^"]+)"/g)].map((match) => match[1]!).join(' ');

      log.push(await ids(), String((await ids()) === (await ids())));
    },
    expected: ['gauge#a gauge#b', 'true'],
  },
  {
    id: 'foreign-ssr-gives-two-islands-of-the-same-component-their-own-ids',
    src: 'janux',
    run: async (log) => {
      const left = foreign(Gauge, { name: 'left-gauge' });
      const right = foreign(Gauge, { name: 'right-gauge' });
      const markup = await html(jsx('main', { children: [jsx(left as never, {}), jsx(right as never, {})] }));

      log.push([...markup.matchAll(/data-jx="([^"]+)"/g)].map((match) => match[1]!).join(' '));
    },
    expected: ['left-gauge#default right-gauge#default'],
  },
  {
    id: 'foreign-ssr-emits-a-large-foreign-subtree-in-one-piece',
    src: 'janux',
    run: async (log) => {
      const Big = () =>
        createElement(
          'ul',
          null,
          Array.from({ length: 1000 }, (_, index) => createElement('li', { key: index }, String(index))),
        );
      const markup = await html(jsx(foreign(Big, { name: 'big' }) as never, {}));

      log.push(String([...markup.matchAll(/<li>/g)].length), String(markup.endsWith('</ul></janux-foreign>')));
    },
    expected: ['1000', 'true'],
  },
  {
    id: 'foreign-ssr-streams-a-foreign-host-with-its-content-already-inside',
    src: 'janux',
    run: async (log) => {
      // Nothing about a foreign island is deferred: whatever React produced is
      // in the first flush, so paint-before-JS shows the real thing.
      const { chunks } = renderToStream(jsx('main', { children: jsx(GaugeIsland as never, { level: 6 }) }));
      const seen: string[] = [];

      for await (const chunk of chunks) seen.push(chunk);
      const markup = seen.join('');
      const host = seen.find((chunk) => chunk.includes('<janux-foreign')) ?? '';

      log.push(String(markup.includes('vol:6')), String(host.includes('vol:6')));
    },
    expected: ['true', 'true'],
  },
  {
    id: 'foreign-ssr-an-async-react-component-is-reported-rather-than-rendered-empty',
    src: 'janux',
    run: async (log) => {
      // `renderToString` cannot await: a server-component-shaped foreign is a
      // configuration that can never work, and it has to say so.
      const Async = async () => createElement('b', null, 'later');

      await attempt(log, 'render', () => html(jsx(foreign(Async as never, { name: 'async-leaf' }) as never, {})));
    },
    expected: [
      "render:threw:Janux: foreign <async-leaf> failed to server-render. A component suspended while responding to synchronous input. This will cause the UI to be replaced with a loading indicator. To fix, updates that suspend should be wrapped with startTransition. Set `hydrate: 'only'` to skip SSR for this island.",
    ],
  },
  {
    id: 'foreign-ssr-keeps-a-hydrate-only-directive-on-a-host-inside-an-island',
    src: 'janux',
    run: async (log) => {
      const island = component({
        name: 'only-shell',
        description: 'Only',
        state: schema({ a: str().default('') }),
        intents: {},
        view: () => jsx(foreign(Gauge, { name: 'inner-only', hydrate: 'only' }) as never, {}),
      });
      const markup = await html(jsx(island as never, {}));

      log.push(markup.match(/janux-foreign[^>]*/)![0]!);
    },
    expected: ['janux-foreign data-jx="inner-only#only-shell.default.1" data-jxf-hydrate="only"'],
  },
  {
    id: 'foreign-ssr-an-island-and-a-foreign-sharing-a-name-stay-separate-hosts',
    src: 'janux',
    run: async (log) => {
      const twin = component({
        name: 'twin',
        description: 'Twin',
        state: schema({ a: str().default('') }),
        intents: {},
        view: () => jsx(foreign(Gauge, { name: 'twin' }) as never, { level: 1 }),
      });
      const markup = await html(jsx(twin as never, {}));

      log.push([...markup.matchAll(/<janux-(island|foreign)[^>]*?data-jx="([^"]+)"/g)].map((match) => `${match[1]}:${match[2]}`).join(' '));
    },
    expected: ['island:twin#default foreign:twin#twin.default.1'],
  },
  {
    id: 'foreign-ssr-renders-a-foreign-under-a-locale-without-touching-its-markup',
    src: 'janux',
    run: async (log) => {
      // Localisation rewrites Janux `<a href>`s; a foreign subtree belongs to
      // its own runtime and must come out byte-identical.
      const node = () => jsx(foreign(Linky, { name: 'linky' }) as never, {});
      const plain = await html(node());
      const localized = await html(node(), { ctx: { i18n: { locale: 'es', locales: ['en', 'es'], defaultLocale: 'en', t: (key: string) => key } } });

      log.push(String(plain === localized), String(plain.includes('href="/docs"')));
    },
    expected: ['true', 'true'],
  },
  {
    id: 'foreign-ssr-renders-the-same-markup-however-often-the-page-is-rendered',
    src: 'janux',
    run: async (log) => {
      const once = await html(jsx(GaugeIsland as never, { level: 2 }));
      const twice = await html(jsx(GaugeIsland as never, { level: 2 }));

      log.push(String(once === twice));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-ssr-does-not-let-a-foreign-render-write-into-island-state',
    src: 'janux',
    run: async (log) => {
      const Writer = ({ state }: { state: { label: string } }) => {
        state.label = 'written-by-react';

        return createElement('output', null, state.label);
      };
      const island = component({
        name: 'writer-shell',
        description: 'Writer',
        state: schema({ label: str().default('untouched') }),
        intents: {},
        view: (bag) => jsx(foreign(Writer, { name: 'writer', props: (own) => ({ state: own.state }) }) as never, { state: bag.state }),
      });
      const { html: markup, snapshots } = await renderToString(jsx(island as never, {}), {});

      log.push(text(markup), String(snapshots[0]!.state.label));
    },
    expected: ['written-by-react', 'untouched'],
  },
];
