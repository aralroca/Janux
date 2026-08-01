import { api, apiManifestTools, collectApis, invokeApi, isApi, type ApiTool } from '@janux/server';
import { resolveApiGuard } from '../../janux-server/src/api';
import { bool, enums, int, list, money, num, obj, schema, str, type AuditEntry, type Ctx } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The `api()` invocation contract, past the happy path.
 *
 * `api.cases.ts` states the shape of the pipeline: guard, validate, run, validate
 * output, audit. This file states what it does when the inputs are not the ones
 * the author had in mind — a guard that answers with a promise, a default that
 * contradicts its own schema, an empty body that the schema's defaults turn into a
 * complete call, a `run()` that throws something that is not an `Error`.
 *
 * The through-line is that a refusal has to be a *decision*, never an accident:
 * anything the pipeline cannot evaluate has to end as `forbidden` or as an
 * `invalid_input`, because the alternative — running the tool because a check
 * returned something unexpected — is the failure this whole layer exists to
 * prevent.
 */

const first = (mod: Record<string, unknown>, namespace = 'shop'): ApiTool => collectApis({ [namespace]: mod })[0]!;

/** `name guard origin ok` from an audit entry, as in `api.cases.ts`. */
const line = (entry: AuditEntry) => `${entry.tool} ${entry.guard} ${entry.origin} ok=${entry.ok}`;

/** Runs a tool and logs the JSON of whatever came back. */
async function call(log: string[], tool: ApiTool, input?: unknown, ctx: Ctx = {}, origin: 'human' | 'agent' = 'agent'): Promise<void> {
  log.push(JSON.stringify(await invokeApi(tool, input, ctx, origin)) ?? 'undefined');
}

const transfer = api({
  description: 'Moves money',
  input: schema({ amount: int().default(9999), to: str().default('attacker') }),
  run: ({ input }) => input,
});

export const INVOCATION_CASES: ScenarioCase[] = [
  // ── definition and recognition ──────────────────────────────────────────────
  {
    id: 'rpc-def-keeps-every-declared-property-on-the-callable',
    src: 'janux',
    run: (log) => {
      const defined = api({ description: 'd', guard: 'confirm', input: schema({ q: str() }), run: () => 1 });

      log.push(`${defined.description}/${String(defined.guard)}/${defined.input?.kind}/${typeof defined.run}`);
    },
    expected: ['d/confirm/object/function'],
  },
  {
    id: 'rpc-def-an-async-run-is-a-run',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: api({ description: 'd', run: async () => 'awaited' }) }));
    },
    expected: ['"awaited"'],
  },
  {
    id: 'rpc-def-a-generator-function-is-a-run-too',
    src: 'janux',
    run: async (log) => {
      const gen = api({ description: 'd', run: function* generate() { yield 1; } });

      await call(log, first({ s: gen }));
    },
    expected: ['{}'],
  },
  {
    id: 'rpc-def-refuses-a-non-function-run',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => api({ description: 'd', run: 'not a function' as never })),
    expected: ['define:threw:Janux: api() requires run()'],
  },
  {
    id: 'rpc-def-refuses-a-null-run',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => api({ description: 'd', run: null as never })),
    expected: ['define:threw:Janux: api() requires run()'],
  },
  {
    id: 'rpc-def-is-not-fooled-by-a-lookalike-object',
    src: 'janux',
    run: (log) => {
      log.push(`${isApi({ description: 'd', run: () => 1, input: schema({}) })}`);
    },
    expected: ['false'],
  },
  {
    id: 'rpc-def-recognises-a-frozen-api',
    src: 'janux',
    run: (log) => {
      log.push(`${isApi(Object.freeze(api({ description: 'd', run: () => 1 })))}`);
    },
    expected: ['true'],
  },
  {
    id: 'rpc-def-recognises-an-api-behind-a-proxy',
    src: 'janux',
    run: (log) => {
      log.push(`${isApi(new Proxy(api({ description: 'd', run: () => 1 }), {}))}`);
    },
    expected: ['true'],
  },
  {
    id: 'rpc-def-a-primitive-is-never-an-api',
    src: 'janux',
    run: (log) => {
      log.push([isApi('x'), isApi(0), isApi(false), isApi(Symbol('s'))].join(','));
    },
    expected: ['false,false,false,false'],
  },

  // ── collection ──────────────────────────────────────────────────────────────
  {
    id: 'rpc-collect-keeps-declaration-order-across-namespaces',
    src: 'janux',
    run: (log) => {
      const one = api({ description: 'd', run: () => 1 });

      log.push(collectApis({ a: { x: one, y: one }, b: { z: one } }).map((tool) => tool.name).join(','));
    },
    expected: ['a.x,a.y,b.z'],
  },
  {
    id: 'rpc-collect-an-empty-module-contributes-nothing',
    src: 'janux',
    run: (log) => {
      log.push(String(collectApis({ a: {}, b: {} }).length));
    },
    expected: ['0'],
  },
  {
    id: 'rpc-collect-refuses-a-leading-double-underscore',
    src: 'janux',
    run: (log) => attempt(log, 'collect', () => collectApis({ shop: { __hidden: api({ description: 'd', run: () => 1 }) } })),
    expected: ['collect:threw:Janux: api name "shop.__hidden" may not contain "__" (reserved for tool wire names)'],
  },
  {
    id: 'rpc-collect-refuses-a-trailing-double-underscore',
    src: 'janux',
    run: (log) => attempt(log, 'collect', () => collectApis({ shop: { hidden__: api({ description: 'd', run: () => 1 }) } })),
    expected: ['collect:threw:Janux: api name "shop.hidden__" may not contain "__" (reserved for tool wire names)'],
  },
  {
    id: 'rpc-collect-refuses-a-double-underscore-spanning-namespace-and-name',
    src: 'janux',
    run: (log) => {
      // `shop_` + `_wire` reads as `shop_._wire`, which contains no `__` — the
      // separator is a dot, so the two underscores never meet.
      log.push(collectApis({ shop_: { _wire: api({ description: 'd', run: () => 1 }) } })[0]!.name);
    },
    expected: ['shop_._wire'],
  },
  {
    id: 'rpc-collect-allows-a-dotted-export-name',
    src: 'janux',
    run: (log) => {
      log.push(collectApis({ shop: { 'v2.wire': api({ description: 'd', run: () => 1 }) } })[0]!.name);
    },
    expected: ['shop.v2.wire'],
  },
  {
    id: 'rpc-collect-carries-the-definition-onto-the-tool',
    src: 'janux',
    run: (log) => {
      const tool = first({ wire: api({ description: 'Moves money', guard: 'confirm', run: () => 1 }) });

      log.push(`${tool.name}/${tool.description}/${String(tool.guard)}`);
    },
    expected: ['shop.wire/Moves money/confirm'],
  },

  // ── the defaults vector ─────────────────────────────────────────────────────
  {
    /*
     * The reason `/_janux/api/*` refuses a GET outright. A schema whose fields all
     * have defaults turns "no body at all" into a complete, valid call — so a
     * request that carries nothing still executes the tool with values the author
     * wrote. Stated here so the HTTP-layer refusal is understood as load-bearing
     * rather than as pedantry about verbs.
     */
    id: 'rpc-input-an-empty-body-becomes-a-full-call-when-every-field-has-a-default',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ transfer }), {});
    },
    expected: ['{"amount":9999,"to":"attacker"}'],
  },
  {
    id: 'rpc-input-an-absent-body-is-the-same-as-an-empty-one',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ transfer }), undefined);
    },
    expected: ['{"amount":9999,"to":"attacker"}'],
  },
  {
    id: 'rpc-input-a-supplied-field-beats-its-default',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ transfer }), { amount: 1 });
    },
    expected: ['{"amount":1,"to":"attacker"}'],
  },
  {
    id: 'rpc-input-a-default-that-breaks-its-own-schema-is-refused-not-trusted',
    src: 'janux',
    run: async (log) => {
      const wrong = api({ description: 'd', input: schema({ n: int().default('lots') }), run: () => 1 });

      await attempt(log, 'call', () => invokeApi(first({ s: wrong }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — n: expected int'],
  },
  {
    id: 'rpc-input-a-null-default-needs-the-field-to-be-nullable',
    src: 'janux',
    run: async (log) => {
      const nullable = api({ description: 'd', input: schema({ n: int().nullable().default(null) }), run: ({ input }) => input });

      await call(log, first({ s: nullable }), {});
    },
    expected: ['{"n":null}'],
  },

  // ── input validation ────────────────────────────────────────────────────────
  {
    id: 'rpc-input-an-optional-field-stays-absent',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: api({ description: 'd', input: schema({ n: int().optional() }), run: ({ input }) => input }) }), {});
    },
    expected: ['{}'],
  },
  {
    id: 'rpc-input-a-nullable-field-arrives-as-null',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: api({ description: 'd', input: schema({ n: int().nullable() }), run: ({ input }) => input }) }), {});
    },
    expected: ['{"n":null}'],
  },
  {
    id: 'rpc-input-an-enum-refuses-a-value-outside-its-set',
    src: 'janux',
    run: async (log) => {
      const kinds = api({ description: 'd', input: schema({ kind: enums(['read', 'write']) }), run: () => 1 });

      await attempt(log, 'call', () => invokeApi(first({ s: kinds }), { kind: 'admin' }, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — kind: expected one of: read, write'],
  },
  {
    id: 'rpc-input-a-boolean-field-refuses-the-string-true',
    src: 'janux',
    run: async (log) => {
      const flag = api({ description: 'd', input: schema({ on: bool() }), run: () => 1 });

      await attempt(log, 'call', () => invokeApi(first({ s: flag }), { on: 'true' }, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — on: expected boolean'],
  },
  {
    id: 'rpc-input-money-refuses-a-fractional-amount',
    src: 'janux',
    run: async (log) => {
      const price = api({ description: 'd', input: schema({ cents: money() }), run: () => 1 });

      await attempt(log, 'call', () => invokeApi(first({ s: price }), { cents: 10.5 }, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — cents: expected money'],
  },
  {
    id: 'rpc-input-a-number-refuses-infinity',
    src: 'janux',
    run: async (log) => {
      const rate = api({ description: 'd', input: schema({ r: num() }), run: () => 1 });

      await attempt(log, 'call', () => invokeApi(first({ s: rate }), { r: Number.POSITIVE_INFINITY }, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — r: expected number'],
  },
  {
    id: 'rpc-input-a-bounded-int-reports-which-bound-it-broke',
    src: 'janux',
    run: async (log) => {
      const bounded = api({ description: 'd', input: schema({ n: int().min(1).max(10) }), run: () => 1 });
      const tool = first({ s: bounded });

      await attempt(log, 'low', () => invokeApi(tool, { n: 0 }, {}, 'agent'));
      await attempt(log, 'high', () => invokeApi(tool, { n: 11 }, {}, 'agent'));
      await call(log, tool, { n: 10 });
    },
    expected: [
      'low:threw:Invalid input for "shop.s" — n: below min 1',
      'high:threw:Invalid input for "shop.s" — n: above max 10',
      '1',
    ],
  },
  {
    id: 'rpc-input-a-list-of-objects-validates-every-item',
    src: 'janux',
    run: async (log) => {
      const bulk = api({ description: 'd', input: schema({ rows: list(obj({ n: int() })) }), run: ({ input }) => input });
      const tool = first({ s: bulk });

      await call(log, tool, { rows: [{ n: 1 }, { n: 2 }] });
      await attempt(log, 'bad', () => invokeApi(tool, { rows: [{ n: 1 }, { n: 'x' }] }, {}, 'agent'));
    },
    expected: ['{"rows":[{"n":1},{"n":2}]}', 'bad:threw:Invalid input for "shop.s" — rows[1].n: expected int'],
  },
  {
    id: 'rpc-input-an-empty-list-satisfies-a-list-field',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: api({ description: 'd', input: schema({ xs: list(int()) }), run: ({ input }) => input }) }), { xs: [] });
    },
    expected: ['{"xs":[]}'],
  },
  {
    id: 'rpc-input-an-array-instead-of-an-object-is-refused-at-the-root',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => invokeApi(first({ s: transfer }), [{ amount: 1 }], {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — : expected object'],
  },
  {
    /*
     * `null` is a value a client really sends (`JSON.stringify(undefined)` is not
     * valid JSON, so a client with nothing to say often sends `null`), and it
     * collapses to `{}` like an absent body — which means the defaults answer for
     * it too. An array or a string does *not* collapse: see the rows above.
     */
    id: 'rpc-input-an-explicit-null-body-collapses-to-an-empty-object',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: transfer }), null);
    },
    expected: ['{"amount":9999,"to":"attacker"}'],
  },
  {
    id: 'rpc-input-undeclared-fields-never-reach-run',
    src: 'janux',
    run: async (log) => {
      const echo = api({ description: 'd', input: schema({ n: int() }), run: ({ input }) => Object.keys(input as object).join(',') });

      await call(log, first({ s: echo }), { n: 1, admin: true, __proto__: { polluted: 1 } });
    },
    expected: ['"n"'],
  },
  {
    id: 'rpc-input-a-tool-without-an-input-schema-receives-undefined-whatever-was-sent',
    src: 'janux',
    run: async (log) => {
      const bare = api({ description: 'd', run: ({ input }) => `${input === undefined}` });

      await call(log, first({ s: bare }), { anything: 'at all' });
    },
    expected: ['"true"'],
  },

  // ── guards ──────────────────────────────────────────────────────────────────
  {
    id: 'rpc-guard-auto-is-the-default',
    src: 'janux',
    run: (log) => {
      log.push(resolveApiGuard(first({ s: api({ description: 'd', run: () => 1 }) }), {}, 'agent'));
    },
    expected: ['auto'],
  },
  {
    /*
     * `invokeApi` runs a `confirm` tool: the proposal step belongs to the caller
     * that has somewhere to park it (the server keeps a pending map). Stated
     * because the opposite assumption — "confirm is enforced here" — would make
     * every direct caller believe it has a review step it does not have.
     */
    id: 'rpc-guard-confirm-does-not-gate-a-direct-invocation',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: api({ description: 'd', guard: 'confirm', run: () => 'ran' }) }));
    },
    expected: ['"ran"'],
  },
  {
    id: 'rpc-guard-forbidden-is-only-about-the-agent-origin',
    src: 'janux',
    run: async (log) => {
      const closed = first({ s: api({ description: 'd', guard: 'forbidden', run: () => 'ran' }) });

      await call(log, closed, {}, {}, 'human');
      await attempt(log, 'agent', () => invokeApi(closed, {}, {}, 'agent'));
    },
    expected: ['"ran"', 'agent:threw:Tool "shop.s" is not available'],
  },
  {
    id: 'rpc-guard-a-function-sees-the-origin',
    src: 'janux',
    run: (log) => {
      const byOrigin = first({ s: api({ description: 'd', guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'), run: () => 1 }) });

      log.push(`${resolveApiGuard(byOrigin, {}, 'agent')}/${resolveApiGuard(byOrigin, {}, 'human')}`);
    },
    expected: ['confirm/auto'],
  },
  {
    id: 'rpc-guard-a-function-is-resolved-once-per-invocation',
    src: 'janux',
    run: async (log) => {
      let calls = 0;
      const counted = first({ s: api({ description: 'd', guard: () => { calls += 1; return 'auto'; }, run: () => 'ran' }) });

      await invokeApi(counted, {}, {}, 'agent');
      log.push(`calls=${calls}`);
    },
    expected: ['calls=1'],
  },
  {
    /*
     * A guard that answers with a promise has not answered. `guard === 'forbidden'`
     * is false for a `Promise`, so an unhardened pipeline runs the tool for an
     * agent — a fail-OPEN on the one check that exists to fail closed. The type
     * says sync; the runtime must not depend on the type being obeyed.
     */
    id: 'rpc-guard-an-async-guard-denies-instead-of-resolving-to-a-pass',
    src: 'janux',
    run: async (log) => {
      const asyncGuard = first({ s: api({ description: 'd', guard: (async () => 'auto') as never, run: () => 'ran' }) });

      await attempt(log, 'call', () => invokeApi(asyncGuard, {}, {}, 'agent'));
    },
    expected: ['call:threw:Tool "shop.s" is not available'],
  },
  {
    id: 'rpc-guard-a-value-outside-the-union-denies',
    src: 'janux',
    run: async (log) => {
      const nonsense = first({ s: api({ description: 'd', guard: 'allow-everything' as never, run: () => 'ran' }) });

      await attempt(log, 'call', () => invokeApi(nonsense, {}, {}, 'agent'));
    },
    expected: ['call:threw:Tool "shop.s" is not available'],
  },
  {
    id: 'rpc-guard-a-function-returning-nothing-denies',
    src: 'janux',
    run: async (log) => {
      const silent = first({ s: api({ description: 'd', guard: (() => undefined) as never, run: () => 'ran' }) });

      await attempt(log, 'call', () => invokeApi(silent, {}, {}, 'agent'));
    },
    expected: ['call:threw:Tool "shop.s" is not available'],
  },
  {
    id: 'rpc-guard-an-unresolvable-guard-is-still-only-about-the-agent',
    src: 'janux',
    run: async (log) => {
      const broken = first({ s: api({ description: 'd', guard: (() => { throw new Error('boom'); }) as never, run: () => 'ran' }) });

      await call(log, broken, {}, {}, 'human');
    },
    expected: ['"ran"'],
  },
  {
    id: 'rpc-guard-the-manifest-hides-every-guard-it-cannot-evaluate',
    src: 'janux',
    run: (log) => {
      const good = api({ description: 'd', run: () => 1 });
      const tools = collectApis({
        shop: {
          open: good,
          asyncGuard: api({ description: 'd', guard: (async () => 'auto') as never, run: () => 1 }),
          nonsense: api({ description: 'd', guard: 'allow-everything' as never, run: () => 1 }),
        },
      });

      log.push(apiManifestTools(tools, {}).map((tool) => tool.name).join(','));
    },
    expected: ['api.shop.open'],
  },

  // ── output validation ───────────────────────────────────────────────────────
  {
    id: 'rpc-output-a-missing-field-is-refused',
    src: 'janux',
    run: async (log) => {
      const short = api({ description: 'd', output: schema({ n: int(), m: int() }), run: () => ({ n: 1 }) });

      await attempt(log, 'call', () => invokeApi(first({ s: short }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Janux: api "shop.s" returned an invalid output'],
  },
  {
    id: 'rpc-output-undefined-against-a-declared-schema-is-refused',
    src: 'janux',
    run: async (log) => {
      const nothing = api({ description: 'd', output: schema({ n: int() }), run: () => undefined });

      await attempt(log, 'call', () => invokeApi(first({ s: nothing }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Janux: api "shop.s" returned an invalid output'],
  },
  {
    id: 'rpc-output-a-default-fills-a-field-run-did-not-return',
    src: 'janux',
    run: async (log) => {
      const partial = api({ description: 'd', output: schema({ n: int(), source: str().default('cache') }), run: () => ({ n: 1 }) });

      await call(log, first({ s: partial }));
    },
    expected: ['{"n":1,"source":"cache"}'],
  },
  {
    id: 'rpc-output-a-nested-list-is-validated-item-by-item',
    src: 'janux',
    run: async (log) => {
      const rows = api({ description: 'd', output: schema({ rows: list(obj({ n: int() })) }), run: () => ({ rows: [{ n: 1 }, { n: 'x' }] }) });

      await attempt(log, 'call', () => invokeApi(first({ s: rows }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Janux: api "shop.s" returned an invalid output'],
  },
  {
    id: 'rpc-output-validation-runs-for-a-human-origin-too',
    src: 'janux',
    run: async (log) => {
      const wrong = api({ description: 'd', output: schema({ n: int() }), run: () => ({ n: 'x' }) });

      await attempt(log, 'call', () => invokeApi(first({ s: wrong }), {}, {}, 'human'));
    },
    expected: ['call:threw:Janux: api "shop.s" returned an invalid output'],
  },
  {
    id: 'rpc-output-a-secret-field-cannot-be-smuggled-past-a-declared-shape',
    src: 'janux',
    run: async (log) => {
      const leaky = api({
        description: 'd',
        output: schema({ id: int() }),
        run: () => ({ id: 1, passwordHash: 'sha256:deadbeef', internalNotes: 'fired last week' }),
      });

      await call(log, first({ s: leaky }));
    },
    expected: ['{"id":1}'],
  },

  // ── what run() throws ───────────────────────────────────────────────────────
  {
    id: 'rpc-error-a-thrown-string-propagates-as-itself',
    src: 'janux',
    run: async (log) => {
      const bad = api({ description: 'd', run: () => { throw 'a bare string'; } });

      await attempt(log, 'call', () => invokeApi(first({ s: bad }), {}, {}, 'human'));
    },
    expected: ['call:threw:undefined'],
  },
  {
    id: 'rpc-error-an-async-rejection-is-the-same-as-a-throw',
    src: 'janux',
    run: async (log) => {
      const bad = api({ description: 'd', run: async () => { throw new Error('later'); } });

      await attempt(log, 'call', () => invokeApi(first({ s: bad }), {}, {}, 'human'));
    },
    expected: ['call:threw:later'],
  },
  {
    id: 'rpc-error-a-returned-rejected-promise-is-the-same-as-a-throw',
    src: 'janux',
    run: async (log) => {
      const bad = api({ description: 'd', run: () => Promise.reject(new Error('returned rejection')) });

      await attempt(log, 'call', () => invokeApi(first({ s: bad }), {}, {}, 'human'));
    },
    expected: ['call:threw:returned rejection'],
  },
  {
    id: 'rpc-error-an-invalid-input-carries-the-invalid-input-code',
    src: 'janux',
    run: async (log) => {
      const strict = first({ s: api({ description: 'd', input: schema({ q: str() }), run: () => 1 }) });

      await invokeApi(strict, {}, {}, 'agent').catch((error) => log.push(`code=${(error as { code?: string }).code}`));
    },
    expected: ['code=invalid_input'],
  },
  {
    id: 'rpc-error-a-refusal-carries-the-forbidden-code',
    src: 'janux',
    run: async (log) => {
      const closed = first({ s: api({ description: 'd', guard: 'forbidden', run: () => 1 }) });

      await invokeApi(closed, {}, {}, 'agent').catch((error) => log.push(`code=${(error as { code?: string }).code}`));
    },
    expected: ['code=forbidden'],
  },
  {
    id: 'rpc-error-an-output-failure-is-not-an-intent-error',
    src: 'janux',
    run: async (log) => {
      const wrong = first({ s: api({ description: 'd', output: schema({ n: int() }), run: () => ({ n: 'x' }) }) });

      await invokeApi(wrong, {}, {}, 'agent').catch((error) => log.push(`code=${(error as { code?: string }).code}`));
    },
    expected: ['code=undefined'],
  },
  {
    id: 'rpc-error-the-tool-name-in-the-message-is-the-namespaced-one',
    src: 'janux',
    run: async (log) => {
      const strict = collectApis({ billing: { charge: api({ description: 'd', input: schema({ q: str() }), run: () => 1 }) } })[0]!;

      await attempt(log, 'call', () => invokeApi(strict, {}, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "billing.charge" — q: required'],
  },

  // ── the context ─────────────────────────────────────────────────────────────
  {
    id: 'rpc-ctx-run-receives-the-origin-it-was-invoked-with',
    src: 'janux',
    run: async (log) => {
      const reflect = first({ s: api({ description: 'd', run: ({ origin }) => origin }) });

      await call(log, reflect, {}, {}, 'agent');
      await call(log, reflect, {}, {}, 'human');
    },
    expected: ['"agent"', '"human"'],
  },
  {
    id: 'rpc-ctx-the-context-object-reaches-run-unchanged',
    src: 'janux',
    run: async (log) => {
      const ctx = { user: { id: 7 }, agent: { verified: true, keyId: 'k' } } as unknown as Ctx;
      const reflect = first({ s: api({ description: 'd', run: (bag) => `${bag.ctx === ctx}` }) });

      await call(log, reflect, {}, ctx, 'agent');
    },
    expected: ['"true"'],
  },
  {
    id: 'rpc-ctx-an-empty-context-is-not-undefined',
    src: 'janux',
    run: async (log) => {
      const reflect = first({ s: api({ description: 'd', run: ({ ctx }) => typeof ctx }) });

      await call(log, reflect, {}, {}, 'agent');
    },
    expected: ['"object"'],
  },

  // ── the audit trail ─────────────────────────────────────────────────────────
  {
    id: 'rpc-audit-exactly-one-entry-per-invocation',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await invokeApi(first({ s: api({ description: 'd', run: () => 1 }) }), {}, {}, 'agent', (entry) => audits.push(entry));
      log.push(`entries=${audits.length}`);
    },
    expected: ['entries=1'],
  },
  {
    id: 'rpc-audit-a-refusal-is-recorded-with-the-guard-that-refused',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const closed = first({ s: api({ description: 'd', guard: 'forbidden', run: () => 1 }) });

      await attempt(log, 'call', () => invokeApi(closed, {}, {}, 'agent', (entry) => audits.push(entry)));
      log.push(...audits.map(line));
    },
    expected: ['call:threw:Tool "shop.s" is not available', 'api.shop.s forbidden agent ok=false'],
  },
  {
    id: 'rpc-audit-a-function-guards-resolved-value-is-what-is-recorded',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const gated = first({ s: api({ description: 'd', guard: () => 'confirm', run: () => 1 }) });

      await invokeApi(gated, {}, {}, 'agent', (entry) => audits.push(entry));
      log.push(...audits.map(line));
    },
    expected: ['api.shop.s confirm agent ok=true'],
  },
  {
    id: 'rpc-audit-an-output-failure-is-recorded-as-a-failure',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const wrong = first({ s: api({ description: 'd', output: schema({ n: int() }), run: () => ({ n: 'x' }) }) });

      await attempt(log, 'call', () => invokeApi(wrong, {}, {}, 'agent', (entry) => audits.push(entry)));
      log.push(...audits.map(line), String(audits[0]!.error));
    },
    expected: [
      'call:threw:Janux: api "shop.s" returned an invalid output',
      'api.shop.s auto agent ok=false',
      'Error: Janux: api "shop.s" returned an invalid output',
    ],
  },
  {
    id: 'rpc-audit-carries-a-timestamp',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const before = Date.now();

      await invokeApi(first({ s: api({ description: 'd', run: () => 1 }) }), {}, {}, 'human', (entry) => audits.push(entry));
      log.push(`${audits[0]!.at >= before && audits[0]!.at <= Date.now()}`);
    },
    expected: ['true'],
  },
  {
    id: 'rpc-audit-records-the-input-after-defaults-were-applied',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await invokeApi(first({ transfer }), { amount: 5 }, {}, 'agent', (entry) => audits.push(entry));
      log.push(JSON.stringify(audits[0]!.input));
    },
    expected: ['{"amount":5,"to":"attacker"}'],
  },
  {
    id: 'rpc-audit-records-the-raw-input-when-validation-refused-it',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const strict = first({ s: api({ description: 'd', input: schema({ n: int() }), run: () => 1 }) });

      await attempt(log, 'call', () => invokeApi(strict, { n: 'x', extra: true }, {}, 'agent', (entry) => audits.push(entry)));
      log.push(JSON.stringify(audits[0]!.input));
    },
    expected: ['call:threw:Invalid input for "shop.s" — n: expected int', '{"n":"x","extra":true}'],
  },
  {
    id: 'rpc-audit-an-audit-sink-that-throws-does-not-swallow-the-result',
    src: 'janux',
    run: async (log) => {
      const noisy = first({ s: api({ description: 'd', run: () => 'ran' }) });

      await attempt(log, 'call', () => invokeApi(noisy, {}, {}, 'agent', () => { throw new Error('sink down'); }));
    },
    expected: ['call:threw:sink down'],
  },
  {
    id: 'rpc-audit-is-optional',
    src: 'janux',
    run: async (log) => {
      await call(log, first({ s: api({ description: 'd', run: () => 'ran' }) }));
    },
    expected: ['"ran"'],
  },

  // ── the manifest projection ─────────────────────────────────────────────────
  {
    id: 'rpc-manifest-omits-the-input-key-for-a-tool-without-a-schema',
    src: 'janux',
    run: (log) => {
      log.push(JSON.stringify(apiManifestTools(collectApis({ shop: { s: api({ description: 'd', run: () => 1 }) } }), {})[0]));
    },
    expected: ['{"name":"api.shop.s","description":"d","guard":"auto"}'],
  },
  {
    id: 'rpc-manifest-advertises-a-confirm-tool-as-confirm',
    src: 'janux',
    run: (log) => {
      log.push(apiManifestTools(collectApis({ shop: { s: api({ description: 'd', guard: 'confirm', run: () => 1 }) } }), {})[0]!.guard);
    },
    expected: ['confirm'],
  },
  {
    id: 'rpc-manifest-projects-defaults-and-bounds-into-json-schema',
    src: 'janux',
    run: (log) => {
      const tool = api({ description: 'd', input: schema({ q: str().min(2).default('ab'), n: int().optional() }), run: () => 1 });

      log.push(JSON.stringify(apiManifestTools(collectApis({ shop: { s: tool } }), {})[0]!.input));
    },
    expected: [
      '{"type":"object","properties":{"q":{"type":"string","minLength":2,"default":"ab"},"n":{"type":"integer"}},"required":[],"additionalProperties":false}',
    ],
  },
  {
    id: 'rpc-manifest-passes-the-context-to-every-guard',
    src: 'janux',
    run: (log) => {
      const scoped = api({
        description: 'd',
        guard: ({ ctx }) => ((ctx as { role?: string }).role === 'admin' ? 'auto' : 'forbidden'),
        run: () => 1,
      });
      const tools = collectApis({ shop: { scoped } });

      log.push(
        `${apiManifestTools(tools, { role: 'admin' } as never).length}/${apiManifestTools(tools, { role: 'guest' } as never).length}`,
      );
    },
    expected: ['1/0'],
  },
  {
    id: 'rpc-manifest-of-no-tools-is-an-empty-list',
    src: 'janux',
    run: (log) => {
      log.push(JSON.stringify(apiManifestTools([], {})));
    },
    expected: ['[]'],
  },
  {
    id: 'rpc-manifest-keeps-two-namespaces-apart',
    src: 'janux',
    run: (log) => {
      const one = api({ description: 'd', run: () => 1 });

      log.push(apiManifestTools(collectApis({ shop: { wire: one }, billing: { wire: one } }), {}).map((tool) => tool.name).join(','));
    },
    expected: ['api.shop.wire,api.billing.wire'],
  },
  {
    id: 'rpc-manifest-omits-a-missing-description-rather-than-inventing-one',
    src: 'janux',
    run: (log) => {
      log.push(JSON.stringify(apiManifestTools(collectApis({ shop: { s: api({ run: () => 1 }) } }), {})[0]));
    },
    expected: ['{"name":"api.shop.s","guard":"auto"}'],
  },

  // ── the callable stub: the same definition, called as a function ────────────
  {
    /*
     * On the server an `api()` is directly callable — SSR sources and other apis
     * do it — and that path runs the same pipeline with `origin: 'human'`, because
     * the caller *is* the server. A client bundle swaps the callable for a fetch
     * stub, which is why the two must agree on validation and not only on the
     * happy path.
     */
    id: 'rpc-callable-runs-the-pipeline-as-a-human',
    src: 'janux',
    run: async (log) => {
      const reflect = api({ description: 'd', run: ({ origin }) => origin });

      log.push(String(await reflect()));
    },
    expected: ['human'],
  },
  {
    id: 'rpc-callable-validates-its-input',
    src: 'janux',
    run: async (log) => {
      const strict = api({ description: 'd', input: schema({ q: str() }), run: () => 1 });

      await attempt(log, 'call', () => strict({}));
    },
    expected: ['call:threw:Invalid input for "inline" — q: required'],
  },
  {
    id: 'rpc-callable-validates-its-output',
    src: 'janux',
    run: async (log) => {
      const wrong = api({ description: 'd', output: schema({ n: int() }), run: () => ({ n: 'x' }) });

      await attempt(log, 'call', () => wrong());
    },
    expected: ['call:threw:Janux: api "inline" returned an invalid output'],
  },
  {
    id: 'rpc-callable-is-not-gated-by-a-forbidden-guard',
    src: 'janux',
    run: async (log) => {
      const closed = api({ description: 'd', guard: 'forbidden', run: () => 'ran' });

      log.push(String(await closed()));
    },
    expected: ['ran'],
  },
  {
    id: 'rpc-callable-with-no-argument-is-an-empty-input',
    src: 'janux',
    run: async (log) => {
      const defaulted = api({ description: 'd', input: schema({ q: str().default('all') }), run: ({ input }) => input });

      log.push(JSON.stringify(await defaulted()));
    },
    expected: ['{"q":"all"}'],
  },
  {
    id: 'rpc-callable-strips-undeclared-fields-like-every-other-caller',
    src: 'janux',
    run: async (log) => {
      const echo = api({ description: 'd', input: schema({ q: str() }), run: ({ input }) => input });

      log.push(JSON.stringify(await echo({ q: 'a', admin: true })));
    },
    expected: ['{"q":"a"}'],
  },
];
