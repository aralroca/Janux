import { buildDefault, coerceForm, enums, int, list, obj, money, num, schema, str, validate } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Builder guarantees beyond construction: immutability of every modifier,
 * what each derived type carries along, and the freshness contract of the
 * runtime functions.
 *
 * A `JxType` is shared by reference — the same instance validates concurrent
 * requests and seeds many islands — so a modifier that mutated its receiver,
 * or a `validate`/`coerceForm` that wrote into its input, would leak one
 * caller's data into another's. These scenarios pin both directions: deriving
 * never changes the base, and running never changes the input.
 */
export const BUILDER_GUARD_CASES: ScenarioCase[] = [
  // ── the remaining allowed-bounds kinds ──────────────────────────────────────
  { id: 'sch-build-max-is-allowed-on-a-number', src: 'janux', run: (log) => attempt(log, 'max', () => num().max(1)), expected: ['max:ok'] },
  { id: 'sch-build-max-is-allowed-on-money', src: 'janux', run: (log) => attempt(log, 'max', () => money().max(1)), expected: ['max:ok'] },

  // ── building is permissive where validation has the final word ──────────────
  { id: 'sch-build-a-negative-bound-builds', src: 'janux', run: (log) => attempt(log, 'min', () => int().min(-5)), expected: ['min:ok'] },
  { id: 'sch-build-a-fractional-bound-builds-on-an-int', src: 'janux', run: (log) => attempt(log, 'min', () => int().min(1.5)), expected: ['min:ok'] },
  { id: 'sch-build-a-wrong-typed-default-builds', src: 'janux', run: (log) => attempt(log, 'default', () => int().default('x')), expected: ['default:ok'] },

  // ── every modifier derives, never mutates ───────────────────────────────────
  {
    id: 'sch-build-optional-does-not-mutate-the-base',
    src: 'janux',
    run: (log) => {
      const base = int();
      const derived = base.optional();

      log.push(`base:${base.flags.optional}`, `derived:${derived.flags.optional}`);
    },
    expected: ['base:undefined', 'derived:true'],
  },
  {
    id: 'sch-build-nullable-does-not-mutate-the-base',
    src: 'janux',
    run: (log) => {
      const base = str();
      const derived = base.nullable();

      log.push(`base:${base.flags.nullable}`, `derived:${derived.flags.nullable}`);
    },
    expected: ['base:undefined', 'derived:true'],
  },
  {
    id: 'sch-build-default-does-not-mutate-the-base',
    src: 'janux',
    run: (log) => {
      const base = int();
      const derived = base.default(7);

      log.push(`base:${base.flags.defaultValue}`, `derived:${derived.flags.defaultValue}`);
    },
    expected: ['base:undefined', 'derived:7'],
  },
  {
    id: 'sch-build-options-does-not-mutate-the-base',
    src: 'janux',
    run: (log) => {
      const base = int();
      const derived = base.options(() => [1]);

      log.push(`base:${typeof base.optionsOf}`, `derived:${typeof derived.optionsOf}`);
    },
    expected: ['base:undefined', 'derived:function'],
  },

  // ── later flags override, earlier extras survive ────────────────────────────
  { id: 'sch-build-a-later-default-overrides-an-earlier-one', src: 'janux', run: (log) => log.push(String(int().default(1).default(2).flags.defaultValue)), expected: ['2'] },
  {
    id: 'sch-build-optional-then-nullable-set-both-flags',
    src: 'janux',
    run: (log) => {
      const type = int().optional().nullable();

      log.push(`${type.flags.optional},${type.flags.nullable}`);
    },
    expected: ['true,true'],
  },
  { id: 'sch-build-enum-members-survive-a-default', src: 'janux', run: (log) => log.push((enums(['a', 'b']).default('a').values ?? []).join(',')), expected: ['a,b'] },
  { id: 'sch-build-the-list-item-survives-nullable-and-default', src: 'janux', run: (log) => log.push(String(list(int()).nullable().default([]).item?.kind)), expected: ['int'] },
  { id: 'sch-build-options-survive-later-modifiers', src: 'janux', run: (log) => log.push(JSON.stringify(int().options((bag) => [bag.x]).optional().optionsOf?.({ x: 3 }))), expected: ['[3]'] },
  { id: 'sch-build-a-default-of-undefined-leaves-no-default', src: 'janux', run: (log) => log.push(String(int().default(undefined).flags.defaultValue)), expected: ['undefined'] },

  // ── construction shapes ─────────────────────────────────────────────────────
  { id: 'sch-build-list-wraps-a-bare-shape-and-keeps-its-keys', src: 'janux', run: (log) => log.push(Object.keys(list({ a: int(), b: str() }).item?.shape ?? {}).join(',')), expected: ['a,b'] },
  { id: 'sch-build-schema-is-an-object-root', src: 'janux', run: (log) => log.push(`${schema({ n: int() }).kind}:${Object.keys(schema({ n: int() }).shape ?? {}).join(',')}`), expected: ['object:n'] },
  { id: 'sch-build-a-nested-list-keeps-the-inner-item-kind', src: 'janux', run: (log) => log.push(String(list(list(int())).item?.item?.kind)), expected: ['int'] },

  // ── runtime functions never write into their inputs ─────────────────────────
  {
    id: 'sch-build-validate-does-not-mutate-the-input-object',
    src: 'janux',
    run: (log) => {
      const input = { n: 1, extra: 2 };
      const result = validate(obj({ n: int() }), input);

      log.push(`input:${Object.keys(input).join(',')}`, `fresh:${result.value !== input}`);
    },
    expected: ['input:n,extra', 'fresh:true'],
  },
  {
    id: 'sch-build-validate-returns-a-fresh-array',
    src: 'janux',
    run: (log) => {
      const input = [1];
      const result = validate(list(int()), input);

      log.push(String(result.value !== input));
    },
    expected: ['true'],
  },
  {
    id: 'sch-build-coerce-does-not-mutate-the-form-object',
    src: 'janux',
    run: (log) => {
      const form = { n: '2' };
      const coerced = coerceForm(form, obj({ n: int() })) as { n: number };

      log.push(`original:${typeof form.n}`, `coerced:${coerced.n}`);
    },
    expected: ['original:string', 'coerced:2'],
  },
  {
    id: 'sch-build-builddefault-returns-the-default-by-reference',
    src: 'janux',
    run: (log) => {
      // The seed is handed out verbatim, not cloned — mutating state seeded from
      // a shared default mutates the schema's default. Pinned so a future clone
      // shows up as a deliberate contract change, not a silent one.
      const seed = { n: 1 };

      log.push(String(buildDefault(obj({ n: int() }).default(seed)) === seed));
    },
    expected: ['true'],
  },
];
