import { createInstance, jsx } from 'janux';
import { bool, int, obj, schema, str } from 'janux/types';
import type { ComponentDef, IntentDef, IntentRef } from '../../janux/src/define/types';
import { attempt, type ScenarioCase } from '../support/scenario';
import { act, captureWarns, island, render } from './harness';

/**
 * `.with(data)`: the only way a view hands data to an intent, because a handler
 * cannot be a closure. Two halves live here — what the binding serializes into
 * `data-input` at render time, and how a bound ref merges its input at call
 * time. Both must hold for the same list of rows to stop clobbering each other.
 */

/** Renders one element and logs its marker plus the `data-input` the bindings produced. */
async function wire(log: string[], props: (i: Record<string, IntentRef>) => Record<string, unknown>, key?: string): Promise<void> {
  const warns = captureWarns();
  const def = island({
    intents: { go: act({ run: () => undefined }), other: act({ run: () => undefined }) },
    view: ({ intents }) => jsx('b', props(intents as Record<string, IntentRef>)),
  });
  const html = await render(key === undefined ? def : ({ ...def, name: def.name } as ComponentDef));

  warns.taken().forEach((warn) => log.push(`warn:${warn}`));
  log.push(`marker:${/data-jxa="([^"]*)"/.exec(html)?.[1] ?? 'none'}`);
  log.push(`input:${/data-input="([^"]*)"/.exec(html)?.[1] ?? 'none'}`);
}

/** A live instance whose single intent `go` records what its `run` received. */
function open(log: string[], def: Partial<IntentDef> = {}): Record<string, IntentRef> {
  const component: ComponentDef = island({
    intents: { go: act({ ...def, run: ({ input }) => log.push(`ran:${JSON.stringify(input) ?? 'undefined'}`) }) },
    view: () => null,
  });

  return createInstance(component as never).intents as unknown as Record<string, IntentRef>;
}

type Call = (input?: unknown) => Promise<unknown>;

export const WITH_BINDING_CASES: ScenarioCase[] = [
  // ── what the binding serializes ────────────────────────────────────────────
  {
    id: 'evt-with-serializes-its-input-into-data-input',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ id: 'sneakers' }) })),
    expected: ['marker:w#default:go', 'input:{&quot;id&quot;:&quot;sneakers&quot;}'],
  },
  {
    id: 'evt-an-unbound-ref-emits-a-marker-and-no-data-input',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go! })),
    expected: ['marker:w#default:go', 'input:none'],
  },
  {
    id: 'evt-with-on-a-non-click-event-fills-the-same-per-element-data-input',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onWheel: i.go!.with({ delta: 1 }) })),
    expected: ['marker:none', 'input:{&quot;delta&quot;:1}'],
  },
  {
    id: 'evt-with-keeps-numbers-booleans-and-null-as-json-not-strings',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ n: 3, ok: true, none: null }) })),
    expected: ['marker:w#default:go', 'input:{&quot;n&quot;:3,&quot;ok&quot;:true,&quot;none&quot;:null}'],
  },
  {
    id: 'evt-with-serializes-nested-objects-and-arrays',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ item: { id: 1, tags: ['a', 'b'] } }) })),
    expected: ['marker:w#default:go', 'input:{&quot;item&quot;:{&quot;id&quot;:1,&quot;tags&quot;:[&quot;a&quot;,&quot;b&quot;]}}'],
  },
  {
    id: 'evt-an-undefined-value-disappears-from-the-serialized-input',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ id: 'x', missing: undefined }) })),
    expected: ['marker:w#default:go', 'input:{&quot;id&quot;:&quot;x&quot;}'],
  },
  {
    id: 'evt-an-empty-with-still-emits-an-empty-data-input',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({}) })),
    expected: ['marker:w#default:go', 'input:{}'],
  },
  {
    id: 'evt-quotes-in-a-bound-value-are-escaped-into-the-attribute',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ q: 'say "hi"' }) })),
    expected: ['marker:w#default:go', 'input:{&quot;q&quot;:&quot;say \\&quot;hi\\&quot;&quot;}'],
  },
  {
    id: 'evt-a-tag-looking-bound-value-cannot-break-out-of-the-attribute',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ q: '</b><script>alert(1)</script>' }) })),
    expected: [
      'marker:w#default:go',
      'input:{&quot;q&quot;:&quot;&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;}',
    ],
  },
  {
    id: 'evt-non-ascii-bound-values-survive-serialization',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ q: 'año 東京' }) })),
    expected: ['marker:w#default:go', 'input:{&quot;q&quot;:&quot;año 東京&quot;}'],
  },
  {
    id: 'evt-a-date-in-a-binding-serializes-through-its-tojson',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ at: new Date(0) }) })),
    expected: ['marker:w#default:go', 'input:{&quot;at&quot;:&quot;1970-01-01T00:00:00.000Z&quot;}'],
  },
  {
    id: 'evt-a-map-in-a-binding-serializes-as-an-empty-object-the-json-trap',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ seen: new Map([['a', 1]]) }) })),
    expected: ['marker:w#default:go', 'input:{&quot;seen&quot;:{}}'],
  },
  {
    id: 'evt-a-cyclic-binding-drops-only-the-input-never-the-marker',
    src: 'janux',
    run: (log) => {
      const cyclic: Record<string, unknown> = {};

      cyclic.self = cyclic;

      return wire(log, (i) => ({ onClick: i.go!.with(cyclic) }));
    },
    expected: [
      'warn:Janux: the .with() input on "onClick" is not JSON-serializable — dropped',
      'marker:w#default:go',
      'input:none',
    ],
  },
  {
    id: 'evt-a-bigint-binding-drops-the-input-with-the-same-warning',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ n: 1n }) })),
    expected: [
      'warn:Janux: the .with() input on "onClick" is not JSON-serializable — dropped',
      'marker:w#default:go',
      'input:none',
    ],
  },
  {
    id: 'evt-a-tojson-that-returns-undefined-drops-the-input-too',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ toJSON: () => undefined } as never) })),
    expected: [
      'warn:Janux: the .with() input on "onClick" is not JSON-serializable — dropped',
      'marker:w#default:go',
      'input:none',
    ],
  },
  {
    id: 'evt-two-bound-events-on-one-element-warn-and-the-first-prop-wins',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!.with({ k: 1 }), onWheel: i.other!.with({ k: 2 }) })),
    expected: [
      'warn:Janux: several .with() bindings on one element — "onClick" wins, data-input is per element',
      'marker:w#default:go',
      'input:{&quot;k&quot;:1}',
    ],
  },
  {
    id: 'evt-an-explicit-data-input-beats-the-binding-and-says-so',
    src: 'janux',
    run: (log) =>
      wire(log, (i) => ({ onClick: i.go!.with({ id: 'bound' }), 'data-input': '{"id":"explicit"}' })),
    expected: [
      'warn:Janux: an explicit data-input wins over the .with() binding on "onClick"',
      'marker:w#default:go',
      'input:{&quot;id&quot;:&quot;explicit&quot;}',
    ],
  },
  {
    id: 'evt-a-bound-ref-on-a-prop-that-is-not-an-event-contributes-no-data-input',
    src: 'janux',
    run: (log) => wire(log, (i) => ({ onClick: i.go!, title: i.other!.with({ k: 1 }) as never })),
    expected: ['marker:w#default:go', 'input:none'],
  },
  {
    id: 'evt-binding-the-same-intent-twice-never-lets-one-row-clobber-the-other',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => undefined }) },
        view: ({ intents }) =>
          jsx('div', {
            children: [
              jsx('b', { class: 'one', onClick: (intents as Record<string, IntentRef>).go!.with({ id: 'a' }) }),
              jsx('b', { class: 'two', onClick: (intents as Record<string, IntentRef>).go!.with({ id: 'b' }) }),
            ],
          }),
      });
      const html = await render(def);

      [...html.matchAll(/data-input="([^"]*)"/g)].forEach((match) => log.push(`input:${match[1]}`));
    },
    expected: ['input:{&quot;id&quot;:&quot;a&quot;}', 'input:{&quot;id&quot;:&quot;b&quot;}'],
  },

  // ── how a bound ref merges at call time ────────────────────────────────────
  {
    id: 'intent-a-bound-ref-called-bare-runs-with-its-bound-input',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      await (intents.go!.with({ id: 'bound' }) as unknown as Call)();
    },
    expected: ['ran:{"id":"bound"}'],
  },
  {
    id: 'intent-with-returns-a-new-ref-and-leaves-the-original-unbound',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str().default('none') }) });

      intents.go!.with({ id: 'bound' });
      await (intents.go as unknown as Call)();
    },
    expected: ['ran:{"id":"none"}'],
  },
  {
    id: 'intent-the-callers-input-wins-over-the-bound-value-for-the-same-key',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str(), keep: int() }) });

      await (intents.go!.with({ id: 'bound', keep: 1 }) as unknown as Call)({ id: 'caller' });
    },
    expected: ['ran:{"id":"caller","keep":1}'],
  },
  {
    id: 'intent-a-primitive-caller-input-goes-through-verbatim-instead-of-being-spread',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      // Spreading it would validate as `{0:'p',1:'l',…}`; passed through, it
      // fails exactly as the same call on an unbound ref would.
      await attempt(log, 'call', () => (intents.go!.with({ id: 'bound' }) as unknown as Call)('plain'));
    },
    expected: ['call:threw:Invalid input for "w.go" — : expected object'],
  },
  {
    id: 'intent-an-array-caller-input-is-not-merged-into-the-bound-object',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      await attempt(log, 'call', () => (intents.go!.with({ id: 'bound' }) as unknown as Call)([1, 2]));
    },
    expected: ['call:threw:Invalid input for "w.go" — : expected object'],
  },
  {
    id: 'intent-a-null-caller-input-replaces-the-binding-rather-than-merging',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      // `null` is not a plain object, so it replaces the binding; the pipeline
      // then reads it as "no input at all" and the schema reports the gap.
      await attempt(log, 'call', () => (intents.go!.with({ id: 'bound' }) as unknown as Call)(null));
    },
    expected: ['call:threw:Invalid input for "w.go" — id: required'],
  },
  {
    id: 'intent-chained-with-calls-accumulate-and-the-later-one-wins',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ a: int(), b: int(), c: int() }) });

      await (intents.go!.with({ a: 1, b: 1 }).with({ b: 2, c: 3 }) as unknown as Call)();
    },
    expected: ['ran:{"a":1,"b":2,"c":3}'],
  },
  {
    id: 'intent-two-refs-chained-from-one-base-stay-independent',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ row: str() }) });
      const base = intents.go!.with({ row: 'base' });

      await (base.with({ row: 'left' }) as unknown as Call)();
      await (base.with({ row: 'right' }) as unknown as Call)();
      await (base as unknown as Call)();
    },
    expected: ['ran:{"row":"left"}', 'ran:{"row":"right"}', 'ran:{"row":"base"}'],
  },
  {
    id: 'intent-the-merge-is-shallow-a-nested-object-is-replaced-whole',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ where: obj({ x: int(), y: int().default(0) }) }) });

      await (intents.go!.with({ where: { x: 1, y: 2 } }) as unknown as Call)({ where: { x: 9 } });
    },
    expected: ['ran:{"where":{"x":9,"y":0}}'],
  },
  {
    id: 'intent-key-order-in-the-binding-does-not-change-what-runs',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ a: int(), b: int() }) });

      await (intents.go!.with({ b: 2, a: 1 }) as unknown as Call)();
    },
    expected: ['ran:{"a":1,"b":2}'],
  },
  {
    id: 'intent-a-bound-ref-carries-its-input-on-dollar-input-for-the-renderer',
    src: 'janux',
    run: (log) => {
      const intents = open(log);
      const bound = intents.go!.with({ id: 'x' });

      log.push(`unbound:${JSON.stringify((intents.go as { $input?: unknown }).$input) ?? 'undefined'}`);
      log.push(`bound:${JSON.stringify((bound as { $input?: unknown }).$input)}`);
    },
    expected: ['unbound:undefined', 'bound:{"id":"x"}'],
  },
  {
    id: 'intent-a-bound-ref-keeps-the-meta-the-marker-is-built-from',
    src: 'janux',
    run: (log) => {
      const intents = open(log);

      log.push(JSON.stringify(intents.go!.with({ id: 'x' }).$intent));
    },
    expected: ['{"component":"w","name":"go"}'],
  },
  {
    id: 'intent-binding-input-a-schema-refuses-fails-validation-and-never-runs',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      await attempt(log, 'call', () => (intents.go!.with({ id: 7 }) as unknown as Call)());
    },
    expected: ['call:threw:Invalid input for "w.go" — id: expected string'],
  },
  {
    id: 'intent-a-caller-value-can-repair-what-the-binding-got-wrong',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      await (intents.go!.with({ id: 7 }) as unknown as Call)({ id: 'fixed' });
    },
    expected: ['ran:{"id":"fixed"}'],
  },
  {
    id: 'intent-schema-defaults-fill-the-keys-the-binding-left-out',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str(), qty: int().default(1) }) });

      await (intents.go!.with({ id: 'x' }) as unknown as Call)();
    },
    expected: ['ran:{"id":"x","qty":1}'],
  },
  {
    id: 'intent-a-binding-key-the-schema-does-not-declare-is-stripped-before-run',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ id: str() }) });

      await (intents.go!.with({ id: 'x', sneaky: 'drop me' }) as unknown as Call)();
    },
    expected: ['ran:{"id":"x"}'],
  },
  {
    id: 'intent-an-intent-with-no-input-schema-ignores-its-binding-entirely',
    src: 'janux',
    run: async (log) => {
      const intents = open(log);

      await (intents.go!.with({ id: 'ignored' }) as unknown as Call)();
    },
    expected: ['ran:undefined'],
  },
  {
    id: 'intent-a-nested-object-schema-validates-the-bound-shape-in-depth',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ where: obj({ x: int(), y: int() }) }) });

      await attempt(log, 'call', () => (intents.go!.with({ where: { x: 1, y: 'no' } }) as unknown as Call)());
    },
    expected: ['call:threw:Invalid input for "w.go" — where.y: expected int'],
  },
  {
    id: 'intent-a-bound-ref-still-answers-to-the-agent-origin-it-is-called-with',
    src: 'janux',
    run: async (log) => {
      const component: ComponentDef = island({
        intents: { go: act({ run: ({ origin, input }) => log.push(`${origin}:${JSON.stringify(input) ?? 'undefined'}`) }) },
        view: () => null,
      });
      const intents = createInstance(component as never).intents;

      await intents.go!.with({ id: 'x' })(undefined, { origin: 'agent' });
      await intents.go!.with({ id: 'x' })();
    },
    expected: ['agent:undefined', 'human:undefined'],
  },
  {
    id: 'intent-a-forbidden-guard-refuses-a-bound-agent-call-before-the-merge-matters',
    src: 'janux',
    run: async (log) => {
      const component: ComponentDef = island({
        intents: { go: act({ guard: 'forbidden', input: schema({ id: str() }), run: () => log.push('ran') }) },
        view: () => null,
      });
      const intents = createInstance(component as never).intents;

      await attempt(log, 'agent', () => intents.go!.with({ id: 'x' })(undefined, { origin: 'agent' }));
      await attempt(log, 'human', () => intents.go!.with({ id: 'x' })());
    },
    expected: ['agent:threw:Intent "w.go" is not available', 'ran', 'human:ok'],
  },
  {
    id: 'intent-a-boolean-binding-survives-the-form-coercion-path',
    src: 'janux',
    run: async (log) => {
      const intents = open(log, { input: schema({ ok: bool() }), coerce: 'form' });

      await (intents.go!.with({ ok: 'on' }) as unknown as Call)();
    },
    expected: ['ran:{"ok":true}'],
  },
];
