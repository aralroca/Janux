import { bool, component, createInstance, enums, int, jsx, list, money, num, obj, schema, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Resuming from a snapshot, kind by kind. `snapshot.cases.ts` pins the door
 * (untrusted JSON in, schema-typed state out); these rows pin what each
 * `JxType` accepts at that door — every kind's happy path, every mismatch that
 * must discard the WHOLE snapshot (fail-closed, `warned`), bounds, nullable
 * and optional flags, defaults (including what a wrong default really does),
 * and the nested places a pollution key can hide.
 */

let seq = 0;

/** Resumes a one-off component with `shape` from `initial`; reports state + warnings. */
function resumed(shape: Record<string, unknown>, initial?: unknown): string {
  const def = component({
    name: `rs-${(seq += 1)}`,
    state: schema(shape as never),
    intents: {},
    view: () => jsx('div', {}),
  });
  const warnings: string[] = [];
  const original = console.warn;

  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
  try {
    const snapshot = createInstance(def, { initial } as never).snapshot();

    return `${JSON.stringify(snapshot)}${warnings.length > 0 ? ' warned' : ''}`;
  } finally {
    console.warn = original;
  }
}

export const RESUME_SCHEMA_CASES: ScenarioCase[] = [
  // ── booleans ────────────────────────────────────────────────────────────────
  {
    id: 'morph-resume-a-boolean-round-trips',
    src: 'janux',
    run: (log) => log.push(resumed({ on: bool() }, { on: true })),
    expected: ['{"on":true}'],
  },
  {
    id: 'morph-resume-a-stringly-true-is-not-a-boolean',
    src: 'janux',
    run: (log) => log.push(resumed({ on: bool() }, { on: 'true' })),
    expected: ['{"on":false} warned'],
  },

  // ── numbers: num is finite, int and money are integers ─────────────────────
  {
    id: 'morph-resume-a-float-fits-a-num-field',
    src: 'janux',
    run: (log) => log.push(resumed({ ratio: num() }, { ratio: 3.14 })),
    expected: ['{"ratio":3.14}'],
  },
  {
    id: 'morph-resume-nan-never-becomes-state',
    src: 'janux',
    run: (log) => log.push(resumed({ ratio: num() }, { ratio: Number.NaN })),
    expected: ['{"ratio":0} warned'],
  },
  {
    id: 'morph-resume-infinity-never-becomes-state',
    src: 'janux',
    run: (log) => log.push(resumed({ ratio: num() }, { ratio: Number.POSITIVE_INFINITY })),
    expected: ['{"ratio":0} warned'],
  },
  {
    id: 'morph-resume-a-float-does-not-fit-an-int-field',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int() }, { n: 1.5 })),
    expected: ['{"n":0} warned'],
  },
  {
    id: 'morph-resume-a-negative-int-is-still-an-int',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int() }, { n: -42 })),
    expected: ['{"n":-42}'],
  },
  {
    id: 'morph-resume-a-numeric-string-is-not-coerced-on-resume',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int() }, { n: '3' })),
    expected: ['{"n":0} warned'],
  },
  {
    id: 'morph-resume-money-is-integer-minor-units',
    src: 'janux',
    run: (log) => log.push(resumed({ cents: money() }, { cents: 1999 })),
    expected: ['{"cents":1999}'],
  },
  {
    id: 'morph-resume-a-decimal-amount-does-not-fit-money',
    src: 'janux',
    run: (log) => log.push(resumed({ cents: money() }, { cents: 19.99 })),
    expected: ['{"cents":0} warned'],
  },

  // ── enums ───────────────────────────────────────────────────────────────────
  {
    id: 'morph-resume-a-declared-enum-member-round-trips',
    src: 'janux',
    run: (log) => log.push(resumed({ mode: enums(['view', 'edit']) }, { mode: 'edit' })),
    expected: ['{"mode":"edit"}'],
  },
  {
    id: 'morph-resume-an-unknown-enum-member-is-rejected',
    src: 'janux',
    run: (log) => log.push(resumed({ mode: enums(['view', 'edit']) }, { mode: 'admin' })),
    expected: ['{"mode":"view"} warned'],
  },
  {
    id: 'morph-resume-an-absent-enum-defaults-to-its-first-value',
    src: 'janux',
    run: (log) => log.push(resumed({ mode: enums(['view', 'edit']) }, undefined)),
    expected: ['{"mode":"view"}'],
  },

  // ── bounds: length for strings, value for numbers ──────────────────────────
  {
    id: 'morph-resume-a-string-below-its-min-length-is-rejected',
    src: 'janux',
    run: (log) => log.push(resumed({ tag: str().min(3) }, { tag: 'ab' })),
    expected: ['{"tag":""} warned'],
  },
  {
    id: 'morph-resume-a-string-over-its-max-length-is-rejected',
    src: 'janux',
    run: (log) => log.push(resumed({ tag: str().max(2) }, { tag: 'abc' })),
    expected: ['{"tag":""} warned'],
  },
  {
    id: 'morph-resume-a-value-exactly-on-the-bound-passes',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int().min(0).max(10) }, { n: 10 })),
    expected: ['{"n":10}'],
  },
  {
    id: 'morph-resume-an-int-over-its-max-value-is-rejected',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int().min(0).max(10) }, { n: 11 })),
    expected: ['{"n":0} warned'],
  },

  // ── nullable, optional, defaults ────────────────────────────────────────────
  {
    id: 'morph-resume-a-nullable-field-accepts-null',
    src: 'janux',
    run: (log) => log.push(resumed({ note: str().nullable() }, { note: null })),
    expected: ['{"note":null}'],
  },
  {
    id: 'morph-resume-null-in-a-non-nullable-field-discards-the-snapshot',
    src: 'janux',
    run: (log) => log.push(resumed({ note: str() }, { note: null })),
    expected: ['{"note":""} warned'],
  },
  {
    id: 'morph-resume-an-absent-nullable-field-defaults-to-null',
    src: 'janux',
    run: (log) => log.push(resumed({ note: str().nullable() }, undefined)),
    expected: ['{"note":null}'],
  },
  {
    id: 'morph-resume-an-absent-optional-field-stays-undefined',
    src: 'janux',
    run: (log) => log.push(resumed({ note: str().optional() }, { note: undefined })),
    expected: ['{}'],
  },
  {
    id: 'morph-resume-an-explicit-default-beats-the-zero-value',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int().default(7), label: str() }, { label: 'x' })),
    expected: ['{"n":7,"label":"x"}'],
  },
  {
    id: 'morph-resume-a-wrong-default-lands-as-is-when-nothing-is-restored',
    src: 'janux',
    run: (log) => {
      // `buildDefault` returns the declared default verbatim — validation only
      // guards values that COME from a snapshot. The corpus states the quirk.
      log.push(resumed({ n: int().default('x' as never) }, undefined));
    },
    expected: ['{"n":"x"}'],
  },

  // ── lists ───────────────────────────────────────────────────────────────────
  {
    id: 'morph-resume-a-list-of-primitives-round-trips',
    src: 'janux',
    run: (log) => log.push(resumed({ ids: list(int()) }, { ids: [1, 2, 3] })),
    expected: ['{"ids":[1,2,3]}'],
  },
  {
    id: 'morph-resume-one-bad-item-discards-the-whole-snapshot',
    src: 'janux',
    run: (log) => log.push(resumed({ ids: list(int()) }, { ids: [1, 'two', 3] })),
    expected: ['{"ids":[]} warned'],
  },
  {
    id: 'morph-resume-an-array-hole-is-a-missing-required-item',
    src: 'janux',
    run: (log) => {
      const holed: number[] = [1];

      holed[2] = 3;
      log.push(resumed({ ids: list(int()) }, { ids: holed }));
    },
    expected: ['{"ids":[]} warned'],
  },
  {
    id: 'morph-resume-a-list-item-sheds-its-undeclared-keys',
    src: 'janux',
    run: (log) => log.push(resumed({ items: list({ id: str() }) }, { items: [{ id: 'a', isAdmin: true }] })),
    expected: ['{"items":[{"id":"a"}]}'],
  },

  // ── nested objects ──────────────────────────────────────────────────────────
  {
    id: 'morph-resume-a-nested-object-round-trips',
    src: 'janux',
    run: (log) => log.push(resumed({ user: obj({ name: str(), age: int() }) }, { user: { name: 'a', age: 3 } })),
    expected: ['{"user":{"name":"a","age":3}}'],
  },
  {
    id: 'morph-resume-a-wrong-nested-leaf-discards-the-whole-snapshot',
    src: 'janux',
    run: (log) => log.push(resumed({ user: obj({ name: str(), age: int() }) }, { user: { name: 'a', age: 'old' } })),
    expected: ['{"user":{"name":"","age":0}} warned'],
  },
  {
    id: 'morph-resume-a-string-where-an-object-belongs-is-rejected',
    src: 'janux',
    run: (log) => log.push(resumed({ user: obj({ name: str() }) }, { user: 'nope' })),
    expected: ['{"user":{"name":""}} warned'],
  },
  {
    id: 'morph-resume-undeclared-keys-are-stripped-inside-nested-objects-too',
    src: 'janux',
    run: (log) => log.push(resumed({ user: obj({ name: str() }) }, { user: { name: 'a', role: 'root' } })),
    expected: ['{"user":{"name":"a"}}'],
  },

  // ── pollution vectors beyond the top level ─────────────────────────────────
  {
    id: 'morph-resume-a-constructor-key-never-becomes-state',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ n: int() }, JSON.parse('{"n":1,"constructor":{"polluted":true}}')));
    },
    expected: ['{"n":1}'],
  },
  {
    id: 'morph-resume-a-nested-proto-key-is-stripped-with-the-snapshot-kept',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ user: obj({ name: str() }) }, JSON.parse('{"user":{"name":"a","__proto__":{"polluted":true}}}')));
    },
    expected: ['{"user":{"name":"a"}}'],
  },

  // ── bounds refuse the kinds they cannot mean anything for ──────────────────
  {
    id: 'morph-resume-bounds-refuse-a-boolean-at-declaration-time',
    src: 'janux',
    run: (log) => {
      try {
        bool().min(2);
        log.push('accepted');
      } catch (error) {
        log.push((error as Error).message.includes('not defined for boolean') ? 'refused clearly' : 'refused vaguely');
      }
    },
    expected: ['refused clearly'],
  },
  {
    id: 'morph-resume-bounds-refuse-a-list-at-declaration-time',
    src: 'janux',
    run: (log) => {
      try {
        list(int()).max(3);
        log.push('accepted');
      } catch (error) {
        log.push((error as Error).message.includes('not defined for list') ? 'refused clearly' : 'refused vaguely');
      }
    },
    expected: ['refused clearly'],
  },

  // ── optional and nullable still type-check what IS present ─────────────────
  {
    id: 'morph-resume-an-optional-field-present-with-the-wrong-type-is-rejected',
    src: 'janux',
    run: (log) => {
      // Asymmetry stated on purpose: `validate` lets an ABSENT optional stay
      // undefined, but the rebuilt-from-defaults state gives every primitive
      // its zero value — optional or not.
      log.push(resumed({ note: str().optional() }, { note: 5 }));
    },
    expected: ['{"note":""} warned'],
  },
  {
    id: 'morph-resume-a-nullable-field-present-with-the-wrong-type-is-rejected',
    src: 'janux',
    run: (log) => log.push(resumed({ note: str().nullable() }, { note: 5 })),
    expected: ['{"note":null} warned'],
  },

  // ── defaults repair, they do not mask ───────────────────────────────────────
  {
    id: 'morph-resume-a-default-fills-a-missing-field-without-discarding-the-rest',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int().default(7), label: str() }, { label: 'kept' })),
    expected: ['{"n":7,"label":"kept"}'],
  },
  {
    id: 'morph-resume-an-enum-default-beats-the-first-value-rule',
    src: 'janux',
    run: (log) => log.push(resumed({ mode: enums(['view', 'edit']).default('edit') }, undefined)),
    expected: ['{"mode":"edit"}'],
  },

  // ── deeper composites ───────────────────────────────────────────────────────
  {
    id: 'morph-resume-a-list-of-enums-round-trips',
    src: 'janux',
    run: (log) => log.push(resumed({ tags: list(enums(['a', 'b'])) }, { tags: ['b', 'a'] })),
    expected: ['{"tags":["b","a"]}'],
  },
  {
    id: 'morph-resume-an-undeclared-enum-member-in-a-list-discards-it-all',
    src: 'janux',
    run: (log) => log.push(resumed({ tags: list(enums(['a', 'b'])) }, { tags: ['a', 'z'] })),
    expected: ['{"tags":[]} warned'],
  },
  {
    id: 'morph-resume-an-object-holding-a-list-of-objects-round-trips',
    src: 'janux',
    run: (log) => log.push(resumed({ cart: obj({ items: list({ id: str(), qty: int() }) }) }, { cart: { items: [{ id: 'a', qty: 2 }] } })),
    expected: ['{"cart":{"items":[{"id":"a","qty":2}]}}'],
  },
  {
    id: 'morph-resume-a-wrong-leaf-three-levels-down-discards-everything',
    src: 'janux',
    run: (log) => log.push(resumed({ cart: obj({ items: list({ id: str(), qty: int() }) }) }, { cart: { items: [{ id: 'a', qty: 'two' }] } })),
    expected: ['{"cart":{"items":[]}} warned'],
  },

  // ── value shapes that look falsy or exotic but are valid ───────────────────
  {
    id: 'morph-resume-the-empty-string-is-a-valid-string',
    src: 'janux',
    run: (log) => log.push(resumed({ label: str() }, { label: '' })),
    expected: ['{"label":""}'],
  },
  {
    id: 'morph-resume-zero-is-a-valid-int',
    src: 'janux',
    run: (log) => log.push(resumed({ n: int() }, { n: 0 })),
    expected: ['{"n":0}'],
  },
  {
    id: 'morph-resume-unicode-state-round-trips-byte-for-byte',
    src: 'janux',
    run: (log) => log.push(resumed({ label: str() }, { label: 'día 🎉 שלום' })),
    expected: ['{"label":"día 🎉 שלום"}'],
  },

  // ── the restored state is live state ────────────────────────────────────────
  {
    id: 'morph-resume-a-nested-restore-is-still-writable-through-an-intent',
    src: 'janux',
    run: async (log) => {
      const def = component({
        name: 'rs-intent',
        state: schema({ n: int(), user: obj({ name: str() }) }),
        intents: { bump: { description: 'Add one', run: ({ state }: any) => (state.n += 1) } as never },
        view: () => jsx('div', {}),
      });
      const instance = createInstance(def, { initial: { n: 4, user: { name: 'a' } } } as never);

      await (instance.intents as any).bump(undefined, { origin: 'human' });
      log.push(`${instance.state.n as number} ${JSON.stringify((instance.state as any).user)}`);
    },
    expected: ['5 {"name":"a"}'],
  },
];
