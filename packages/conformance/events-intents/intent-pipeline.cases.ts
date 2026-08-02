import { createInstance, JanuxIntentError } from 'janux';
import { bool, enums, int, list, money, num, obj, schema, str } from 'janux/types';
import type { AuditEntry } from '../../janux/src/runtime/intents';
import type { ComponentDef, Ctx, IntentDef } from '../../janux/src/define/types';
import type { JanuxInstance } from '../../janux/src/runtime/instance';
import { attempt, type ScenarioCase } from '../support/scenario';
import { act, captureWarns, island } from './harness';

/**
 * The invocation pipeline every caller shares: refuse → ready → validate →
 * run → audit, with `settled()` as the "is anything still happening" answer.
 *
 * The order of those stages is the contract, not an implementation detail: an
 * agent must be refused before a schema error tells it what the arguments look
 * like, and an audit entry must exist for the calls that never ran.
 */

interface Options {
  ctx?: Ctx;
  /** Log every audit entry as `audit:<ok>:<origin>:<guard>[:proposed]`. */
  audit?: boolean;
  /** Log the audit entry's input and error too. */
  detail?: boolean;
  onProposal?: (proposal: { id: string; tool: string; input: unknown }) => void;
}

function trace(log: string[], entry: AuditEntry, detail: boolean): void {
  const head = `audit:${entry.ok}:${entry.origin}:${entry.guard}${entry.proposed ? ':proposed' : ''}`;

  log.push(detail ? `${head}:${JSON.stringify(entry.input) ?? 'undefined'}:${entry.error ?? '-'}` : head);
}

/** A live instance of a one-off component whose intents the row provides. */
function open(log: string[], def: Partial<ComponentDef>, options: Options = {}): JanuxInstance {
  const component = island({ view: () => null, ...def } as never);

  return createInstance(component as never, {
    ctx: options.ctx,
    onAudit: options.audit || options.detail ? (entry) => trace(log, entry, !!options.detail) : undefined,
    onProposal: options.onProposal as never,
  });
}

/** The canonical recorded intent: logs what it received. */
function records(log: string[], extra: Partial<IntentDef> = {}): IntentDef {
  return act({ ...extra, run: ({ input }) => log.push(`ran:${JSON.stringify(input) ?? 'undefined'}`) });
}

export const INTENT_PIPELINE_CASES: ScenarioCase[] = [
  // ── stage order ────────────────────────────────────────────────────────────
  {
    id: 'intent-a-forbidden-agent-call-is-refused-before-the-schema-is-consulted',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'forbidden', input: schema({ id: str() }), run: () => log.push('ran') }) } });

      await attempt(log, 'agent', () => instance.intents.go!({ id: 7 }, { origin: 'agent' }));
    },
    expected: ['agent:threw:Intent "w.go" is not available'],
  },
  {
    id: 'intent-a-forbidden-guard-is-checked-before-readiness',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'forbidden', ready: () => false, run: () => log.push('ran') }) } });

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
      await attempt(log, 'human', () => instance.intents.go!());
    },
    expected: ['agent:threw:Intent "w.go" is not available', 'human:threw:Intent "w.go" is not ready'],
  },
  {
    id: 'intent-readiness-is-checked-before-the-input-is-validated',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ ready: () => false, input: schema({ id: str() }), run: () => log.push('ran') }) } });

      await attempt(log, 'call', () => instance.intents.go!({ id: 42 }));
    },
    expected: ['call:threw:Intent "w.go" is not ready'],
  },
  {
    id: 'intent-readiness-sees-the-live-state-not-a-snapshot-of-it',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ open: bool().default(false) }),
        intents: {
          arm: act({ run: ({ state }) => ((state as { open: boolean }).open = true) }),
          go: act({ ready: ({ state }) => (state as { open: boolean }).open, run: () => log.push('ran') }),
        },
      });

      await attempt(log, 'before', () => instance.intents.go!());
      await instance.intents.arm!();
      await attempt(log, 'after', () => instance.intents.go!());
    },
    expected: ['before:threw:Intent "w.go" is not ready', 'ran', 'after:ok'],
  },
  {
    id: 'intent-a-ready-check-that-returns-a-truthy-non-boolean-lets-the-call-through',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ ready: () => 'yes' as never, run: () => log.push('ran') }) } });

      await instance.intents.go!();
    },
    expected: ['ran'],
  },
  {
    id: 'intent-validation-happens-before-run-so-a-bad-call-mutates-nothing',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ n: int().default(0) }),
        intents: { set: act({ input: schema({ n: int() }), run: ({ state, input }) => ((state as { n: number }).n = (input as { n: number }).n) }) },
      });

      await attempt(log, 'call', () => instance.intents.set!({ n: 'nope' }));
      log.push(`state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['call:threw:Invalid input for "w.set" — n: expected int', 'state:{"n":0}'],
  },
  {
    id: 'intent-the-run-body-batches-its-writes-into-one-flush',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ a: int().default(0), b: int().default(0) }),
        derived: { total: (state) => (state as { a: number; b: number }).a + (state as { a: number; b: number }).b },
        intents: {
          both: act({
            run: ({ state, derived }) => {
              (state as { a: number }).a = 1;
              // Derived stay honest mid-batch: they recompute on demand.
              log.push(`mid:${(derived as { total: number }).total}`);
              (state as { b: number }).b = 2;
            },
          }),
        },
      });

      await instance.intents.both!();
      log.push(`after:${(instance.derived as { total: number }).total}`);
    },
    expected: ['mid:1', 'after:3'],
  },
  {
    id: 'intent-an-await-inside-run-does-not-close-the-write-gate-behind-it',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ n: int().default(0) }),
        intents: {
          slow: act({
            run: async ({ state }) => {
              await Promise.resolve();
              (state as { n: number }).n = 5;
            },
          }),
        },
      });

      await instance.intents.slow!();
      log.push(`state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['state:{"n":5}'],
  },
  {
    id: 'intent-state-cannot-be-written-outside-a-declared-run-body',
    src: 'janux',
    run: (log) => {
      const instance = open(log, { state: schema({ n: int().default(0) }), intents: { go: act({ run: () => undefined }) } });

      attempt(log, 'write', () => ((instance.state as { n: number }).n = 9));
    },
    expected: [
      'write:threw:Janux: illegal mutation of "n" outside an intent, effect or event handler. State can only change inside declared run() bodies (RFC §4.4).',
    ],
  },
  {
    id: 'intent-the-value-run-returns-is-what-the-caller-awaits',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: () => ({ receipt: 'r-1' }) }) } });

      log.push(`result:${JSON.stringify(await instance.intents.go!())}`);
    },
    expected: ['result:{"receipt":"r-1"}'],
  },
  {
    id: 'intent-an-async-run-resolves-the-callers-promise-with-its-awaited-value',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: async () => 'later' }) } });

      log.push(`result:${await instance.intents.go!()}`);
    },
    expected: ['result:later'],
  },
  {
    id: 'intent-the-bag-carries-the-origin-the-caller-declared',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: ({ origin }) => log.push(`origin:${origin}`) }) } });

      await instance.intents.go!();
      await instance.intents.go!(undefined, { origin: 'agent' });
      await instance.intents.go!(undefined, { origin: 'human' });
    },
    expected: ['origin:human', 'origin:agent', 'origin:human'],
  },
  {
    id: 'intent-ctx-reaches-the-run-body-unchanged',
    src: 'janux',
    run: async (log) => {
      const instance = open(
        log,
        { intents: { go: act({ run: ({ ctx }) => log.push(`role:${(ctx as { role: string }).role}`) }) } },
        { ctx: { role: 'admin' } },
      );

      await instance.intents.go!();
    },
    expected: ['role:admin'],
  },
  {
    id: 'intent-an-intent-may-invoke-another-intent-of-the-same-instance',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          inner: act({ run: () => log.push('inner') }),
          outer: act({ run: async ({ intents }) => {
            log.push('outer-start');
            await intents.inner!();
            log.push('outer-end');
          } }),
        },
      });

      await instance.intents.outer!();
    },
    expected: ['outer-start', 'inner', 'outer-end'],
  },

  // ── input validation ───────────────────────────────────────────────────────
  {
    id: 'intent-an-intent-without-an-input-schema-receives-undefined-whatever-is-passed',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log) } });

      await instance.intents.go!({ anything: 1 });
    },
    expected: ['ran:undefined'],
  },
  {
    id: 'intent-a-declared-schema-with-no-input-at-all-builds-its-defaults',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ page: int().default(1), q: str().default('') }) }) } });

      await instance.intents.go!();
    },
    expected: ['ran:{"page":1,"q":""}'],
  },
  {
    id: 'intent-a-missing-required-field-is-reported-by-name',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ id: str() }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({}));
    },
    expected: ['call:threw:Invalid input for "w.go" — id: required'],
  },
  {
    id: 'intent-two-broken-fields-are-reported-in-one-message',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ id: str(), qty: int() }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ id: 1, qty: 'x' }));
    },
    expected: ['call:threw:Invalid input for "w.go" — id: expected string; qty: expected int'],
  },
  {
    id: 'intent-a-nested-path-appears-dotted-in-the-error',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ at: obj({ x: int(), y: int() }) }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ at: { x: 1, y: null } }));
    },
    expected: ['call:threw:Invalid input for "w.go" — at.y: not nullable'],
  },
  {
    id: 'intent-a-list-index-appears-bracketed-in-the-error',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ ids: list(int()) }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ ids: [1, 'two', 3] }));
    },
    expected: ['call:threw:Invalid input for "w.go" — ids[1]: expected int'],
  },
  {
    id: 'intent-an-enum-error-lists-what-was-allowed',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ mode: enums(['fast', 'slow']) }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ mode: 'medium' }));
    },
    expected: ['call:threw:Invalid input for "w.go" — mode: expected one of: fast, slow'],
  },
  {
    id: 'intent-a-string-below-its-minimum-length-is-refused',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ q: str().min(3) }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ q: 'ab' }));
    },
    expected: ['call:threw:Invalid input for "w.go" — q: below min 3'],
  },
  {
    id: 'intent-a-number-above-its-maximum-is-refused',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ qty: int().max(10) }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ qty: 11 }));
    },
    expected: ['call:threw:Invalid input for "w.go" — qty: above max 10'],
  },
  {
    id: 'intent-money-refuses-a-fractional-amount-because-it-counts-minor-units',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ amount: money() }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ amount: 10.5 }));
    },
    expected: ['call:threw:Invalid input for "w.go" — amount: expected money'],
  },
  {
    id: 'intent-a-non-finite-number-is-not-a-number-as-far-as-the-schema-cares',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ ratio: num() }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ ratio: Number.POSITIVE_INFINITY }));
    },
    expected: ['call:threw:Invalid input for "w.go" — ratio: expected number'],
  },
  {
    id: 'intent-undeclared-keys-never-reach-the-run-body',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ id: str() }) }) } });

      await instance.intents.go!({ id: 'x', admin: true, __proto__: { polluted: true } });
    },
    expected: ['ran:{"id":"x"}'],
  },
  {
    id: 'intent-form-coercion-turns-the-strings-a-form-produces-into-typed-input',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: { go: records(log, { coerce: 'form', input: schema({ qty: int(), ok: bool(), ratio: num() }) }) },
      });

      await instance.intents.go!({ qty: '42', ok: 'on', ratio: '1.5' });
    },
    expected: ['ran:{"qty":42,"ok":true,"ratio":1.5}'],
  },
  {
    id: 'intent-form-coercion-reads-an-absent-checkbox-as-false',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { coerce: 'form', input: schema({ ok: bool().default(false) }) }) } });

      await instance.intents.go!({});
    },
    expected: ['ran:{"ok":false}'],
  },
  {
    id: 'intent-form-coercion-still-refuses-what-cannot-be-a-number',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { coerce: 'form', input: schema({ qty: int() }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ qty: 'twelve' }));
    },
    expected: ['call:threw:Invalid input for "w.go" — qty: expected int'],
  },
  {
    id: 'intent-already-typed-input-passes-through-the-form-coercion-unharmed',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { coerce: 'form', input: schema({ qty: int() }) }) } });

      await instance.intents.go!({ qty: 7 });
    },
    expected: ['ran:{"qty":7}'],
  },
  {
    id: 'intent-without-form-coercion-a-numeric-string-is-just-a-wrong-type',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ qty: int() }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ qty: '42' }));
    },
    expected: ['call:threw:Invalid input for "w.go" — qty: expected int'],
  },
  {
    id: 'intent-a-list-schema-accepts-the-single-value-shape-only-when-declared-so',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ tags: list(str()) }) }) } });

      await attempt(log, 'call', () => instance.intents.go!({ tags: 'solo' }));
    },
    expected: ['call:threw:Invalid input for "w.go" — tags: expected list'],
  },
  {
    id: 'intent-an-invalid-call-throws-the-invalid-input-code',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ id: str() }) }) } });

      await instance.intents
        .go!({})
        .catch((error: unknown) => log.push(`code:${(error as JanuxIntentError).code}:${error instanceof JanuxIntentError}`));
    },
    expected: ['code:invalid_input:true'],
  },
  {
    id: 'intent-a-not-ready-call-throws-the-not-ready-code',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ ready: () => false, run: () => undefined }) } });

      await instance.intents.go!().catch((error: unknown) => log.push(`code:${(error as JanuxIntentError).code}`));
    },
    expected: ['code:not_ready'],
  },
  {
    id: 'intent-a-refused-agent-call-throws-the-forbidden-code',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'forbidden', run: () => undefined }) } });

      await instance.intents
        .go!(undefined, { origin: 'agent' })
        .catch((error: unknown) => log.push(`code:${(error as JanuxIntentError).code}`));
    },
    expected: ['code:forbidden'],
  },
  {
    id: 'intent-an-error-thrown-by-run-reaches-the-caller-unwrapped',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: () => { throw new Error('card declined'); } }) } });

      await attempt(log, 'call', () => instance.intents.go!());
    },
    expected: ['call:threw:card declined'],
  },
  {
    id: 'intent-a-rejected-async-run-reaches-the-caller-the-same-way',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: async () => { throw new Error('gateway down'); } }) } });

      await attempt(log, 'call', () => instance.intents.go!());
    },
    expected: ['call:threw:gateway down'],
  },

  // ── guards ─────────────────────────────────────────────────────────────────
  {
    id: 'intent-the-default-guard-is-auto-and-lets-an-agent-through',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: () => log.push('ran') }) } }, { audit: true });

      await instance.intents.go!(undefined, { origin: 'agent' });
    },
    expected: ['ran', 'audit:true:agent:auto'],
  },
  {
    id: 'intent-a-forbidden-guard-never-stops-a-human',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'forbidden', run: () => log.push('ran') }) } });

      await instance.intents.go!();
    },
    expected: ['ran'],
  },
  {
    id: 'intent-a-guard-function-decides-per-origin',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: { go: act({ guard: ({ origin }) => (origin === 'agent' ? 'forbidden' : 'auto'), run: () => log.push('ran') }) },
      });

      await instance.intents.go!();
      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
    },
    expected: ['ran', 'agent:threw:Intent "w.go" is not available'],
  },
  {
    id: 'intent-a-guard-function-decides-per-ctx',
    src: 'janux',
    run: async (log) => {
      const instance = open(
        log,
        { intents: { go: act({ guard: ({ ctx }) => ((ctx as { role: string }).role === 'admin' ? 'auto' : 'forbidden'), run: () => log.push('ran') }) } },
        { ctx: { role: 'viewer' }, audit: true },
      );

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
    },
    expected: ['audit:false:agent:forbidden', 'agent:threw:Intent "w.go" is not available'],
  },
  {
    id: 'intent-a-guard-that-throws-denies-instead-of-taking-the-surface-down',
    src: 'janux',
    run: async (log) => {
      const instance = open(
        log,
        { intents: { go: act({ guard: () => { throw new Error('policy service down'); }, run: () => log.push('ran') }) } },
        { audit: true },
      );

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
    },
    expected: ['audit:false:agent:forbidden', 'agent:threw:Intent "w.go" is not available'],
  },
  {
    id: 'intent-a-guard-that-throws-still-lets-the-human-through-with-the-denied-guard-recorded',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: () => { throw new Error('boom'); }, run: () => log.push('ran') }) } }, { audit: true });

      await instance.intents.go!();
    },
    expected: ['ran', 'audit:true:human:forbidden'],
  },
  {
    id: 'intent-a-guard-returning-nonsense-denies-rather-than-passing-the-answer-through',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: (() => 'maybe') as never, run: () => log.push('ran') }) } }, { audit: true });

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
    },
    // A value that is not one of the three answers is not an answer, and
    // treating it as "not forbidden" opened the gate for every agent call.
    expected: ['audit:false:agent:forbidden', 'agent:threw:Intent "w.go" is not available'],
  },
  {
    id: 'intent-a-bad-guard-answer-tells-the-author-once-instead-of-failing-silently',
    src: 'janux',
    run: async (log) => {
      const warns = captureWarns();
      const instance = open(log, { intents: { go: act({ guard: (() => 'maybe') as never, run: () => undefined }) } });

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
      warns.taken().forEach((warn) => log.push(`warn:${warn}`));
    },
    expected: [
      'agent:threw:Intent "w.go" is not available',
      'warn:Janux: the guard on "w.go" answered "maybe" — expected "auto", "confirm" or "forbidden", so the intent is treated as forbidden',
    ],
  },
  {
    // An `async` guard resolves to a Promise, which is not `'forbidden'` — the
    // gate that exists to fail closed would otherwise fail open, silently.
    id: 'intent-an-async-guard-denies-instead-of-passing-a-promise-off-as-an-answer',
    src: 'janux',
    run: async (log) => {
      const warns = captureWarns();
      const instance = open(log, { intents: { go: act({ guard: (async () => 'auto') as never, run: () => log.push('ran') }) } });

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
      log.push(`warned:${warns.taken().length}`);
    },
    expected: ['agent:threw:Intent "w.go" is not available', 'warned:1'],
  },
  {
    id: 'intent-a-typo-in-a-static-guard-denies-the-agent-and-still-serves-the-human',
    src: 'janux',
    run: async (log) => {
      const warns = captureWarns();
      const instance = open(log, { intents: { go: act({ guard: 'confrim' as never, run: () => log.push('ran') }) } });

      await attempt(log, 'agent', () => instance.intents.go!(undefined, { origin: 'agent' }));
      await attempt(log, 'human', () => instance.intents.go!());
      warns.taken();
    },
    expected: ['agent:threw:Intent "w.go" is not available', 'ran', 'human:ok'],
  },
  {
    id: 'intent-a-confirm-guard-runs-straight-away-for-a-human',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'confirm', run: () => log.push('ran') }) } }, { audit: true });

      await instance.intents.go!();
    },
    expected: ['ran', 'audit:true:human:confirm'],
  },
  {
    id: 'intent-a-confirm-guard-turns-an-agent-call-into-a-proposal-that-has-not-committed',
    src: 'janux',
    run: async (log) => {
      const instance = open(
        log,
        {
          state: schema({ n: int().default(0) }),
          intents: { go: act({ guard: 'confirm', run: ({ state }) => ((state as { n: number }).n += 1) }) },
        },
        { audit: true },
      );
      const result = (await instance.intents.go!(undefined, { origin: 'agent' })) as { status: string; tool: string };

      log.push(`result:${result.status}:${result.tool}`, `state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['audit:true:agent:confirm:proposed', 'result:proposal:w.go', 'state:{"n":0}'],
  },
  {
    // The shadow run is what produces the diff a human approves, and it calls
    // the real body — so anything a `run()` does besides writing state (a log
    // line, a fetch, a counter) happens at proposal time as well as at
    // approval time. Intents behind a `confirm` guard have to be pure.
    id: 'intent-the-shadow-run-behind-a-proposal-executes-the-body-side-effects-included',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ n: int().default(0) }),
        intents: {
          go: act({
            guard: 'confirm',
            run: ({ state }) => {
              log.push('body');
              (state as { n: number }).n += 1;
            },
          }),
        },
      });

      await instance.intents.go!(undefined, { origin: 'agent' });
    },
    expected: ['body'],
  },
  {
    id: 'intent-an-async-body-gets-no-diff-because-the-shadow-cannot-be-trusted-to-be-final',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ n: int().default(0) }),
        intents: { go: act({ guard: 'confirm', run: async ({ state }) => ((state as { n: number }).n += 1) }) },
      });
      const result = (await instance.intents.go!(undefined, { origin: 'agent' })) as { diff?: unknown };

      log.push(`diff:${result.diff === undefined ? 'none' : JSON.stringify(result.diff)}`);
    },
    expected: ['diff:none'],
  },
  {
    id: 'intent-a-proposal-carries-the-validated-input-not-the-raw-one',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: { go: act({ guard: 'confirm', input: schema({ qty: int().default(1) }), run: () => undefined }) },
      });
      const result = (await instance.intents.go!({}, { origin: 'agent' })) as { input: unknown };

      log.push(`input:${JSON.stringify(result.input)}`);
    },
    expected: ['input:{"qty":1}'],
  },
  {
    id: 'intent-a-proposal-shadow-runs-the-body-to-show-what-it-would-change',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ n: int().default(0) }),
        intents: { bump: act({ guard: 'confirm', run: ({ state }) => ((state as { n: number }).n += 1) }) },
      });
      const result = (await instance.intents.bump!(undefined, { origin: 'agent' })) as { diff: unknown };

      log.push(`diff:${JSON.stringify(result.diff)}`);
      log.push(`state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['diff:{"before":{"n":0},"after":{"n":1}}', 'state:{"n":0}'],
  },
  {
    id: 'intent-the-proposal-hook-receives-an-executable-handle-with-an-unguessable-id',
    src: 'janux',
    run: async (log) => {
      const proposals: { id: string; execute: () => Promise<unknown> }[] = [];
      const instance = open(
        log,
        {
          state: schema({ n: int().default(0) }),
          intents: { bump: act({ guard: 'confirm', run: ({ state }) => ((state as { n: number }).n += 1) }) },
        },
        { onProposal: (proposal) => proposals.push(proposal as never) },
      );

      await instance.intents.bump!(undefined, { origin: 'agent' });
      log.push(`shape:${/^prop_w_bump_[0-9a-f-]{36}$/.test(proposals[0]!.id)}`);
      await proposals[0]!.execute();
      log.push(`state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['shape:true', 'state:{"n":1}'],
  },
  {
    id: 'intent-approving-a-proposal-audits-the-execution-separately-from-the-request',
    src: 'janux',
    run: async (log) => {
      const proposals: { execute: () => Promise<unknown> }[] = [];
      const instance = open(
        log,
        {
          state: schema({ n: int().default(0) }),
          intents: { go: act({ guard: 'confirm', run: ({ state }) => ((state as { n: number }).n += 1) }) },
        },
        { audit: true, onProposal: (proposal) => proposals.push(proposal as never) },
      );

      await instance.intents.go!(undefined, { origin: 'agent' });
      await proposals[0]!.execute();
      log.push(`state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['audit:true:agent:confirm:proposed', 'audit:true:agent:confirm', 'state:{"n":1}'],
  },
  {
    id: 'intent-a-proposal-that-is-never-approved-changes-nothing-at-all',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        state: schema({ n: int().default(0) }),
        intents: { bump: act({ guard: 'confirm', run: ({ state }) => ((state as { n: number }).n += 1) }) },
      });

      await instance.intents.bump!(undefined, { origin: 'agent' });
      await instance.settled();
      log.push(`state:${JSON.stringify(instance.snapshot())}`);
    },
    expected: ['state:{"n":0}'],
  },
  {
    id: 'intent-a-confirm-guard-still-validates-before-proposing',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'confirm', input: schema({ id: str() }), run: () => log.push('ran') }) } });

      await attempt(log, 'agent', () => instance.intents.go!({ id: 5 }, { origin: 'agent' }));
    },
    expected: ['agent:threw:Invalid input for "w.go" — id: expected string'],
  },

  // ── the audit trail ────────────────────────────────────────────────────────
  {
    id: 'intent-a-successful-call-audits-the-parsed-input',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ id: str(), qty: int().default(2) }) }) } }, { detail: true });

      await instance.intents.go!({ id: 'x', extra: 'dropped' });
    },
    expected: ['ran:{"id":"x","qty":2}', 'audit:true:human:auto:{"id":"x","qty":2}:-'],
  },
  {
    id: 'intent-a-failed-call-audits-the-raw-input-so-the-trail-shows-what-was-attempted',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: records(log, { input: schema({ id: str() }) }) } }, { detail: true });

      await attempt(log, 'call', () => instance.intents.go!({ id: 5 }));
    },
    expected: [
      'audit:false:human:auto:{"id":5}:Error: Invalid input for "w.go" — id: expected string',
      'call:threw:Invalid input for "w.go" — id: expected string',
    ],
  },
  {
    id: 'intent-a-run-that-throws-is-audited-as-a-failure-before-the-error-escapes',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: () => { throw new Error('declined'); } }) } }, { detail: true });

      await attempt(log, 'call', () => instance.intents.go!());
    },
    expected: ['audit:false:human:auto:undefined:Error: declined', 'call:threw:declined'],
  },
  {
    id: 'intent-a-refusal-is-audited-even-though-nothing-ran',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ guard: 'forbidden', run: () => log.push('ran') }) } }, { detail: true });

      await attempt(log, 'agent', () => instance.intents.go!({ id: 'x' }, { origin: 'agent' }));
    },
    expected: [
      'audit:false:agent:forbidden:{"id":"x"}:Error: Intent "w.go" is not available',
      'agent:threw:Intent "w.go" is not available',
    ],
  },
  {
    id: 'intent-a-not-ready-refusal-is-audited-too',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ ready: () => false, run: () => undefined }) } }, { detail: true });

      await attempt(log, 'call', () => instance.intents.go!());
    },
    expected: [
      'audit:false:human:auto:undefined:Error: Intent "w.go" is not ready',
      'call:threw:Intent "w.go" is not ready',
    ],
  },
  {
    id: 'intent-the-audit-entry-names-the-tool-as-component-dot-intent',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const component = island({ view: () => null, intents: { go: act({ run: () => undefined }) } } as never);
      const instance = createInstance(component as never, { onAudit: (entry) => entries.push(entry) });

      await instance.intents.go!();
      log.push(`tool:${entries[0]!.tool}`);
    },
    expected: ['tool:w.go'],
  },
  {
    id: 'intent-every-audit-entry-is-stamped-with-a-time',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const component = island({ view: () => null, intents: { go: act({ run: () => undefined }) } } as never);
      const instance = createInstance(component as never, { onAudit: (entry) => entries.push(entry) });
      const before = Date.now();

      await instance.intents.go!();
      log.push(`stamped:${entries[0]!.at >= before && entries[0]!.at <= Date.now()}`);
    },
    expected: ['stamped:true'],
  },
  {
    id: 'intent-the-audit-trail-keeps-one-entry-per-call-in-call-order',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { a: act({ run: () => undefined }), b: act({ run: () => undefined }) } }, { audit: true });

      await instance.intents.a!();
      await instance.intents.b!();
      await instance.intents.a!();
    },
    expected: ['audit:true:human:auto', 'audit:true:human:auto', 'audit:true:human:auto'],
  },
  {
    id: 'intent-an-audit-hook-that-throws-does-not-swallow-the-intents-result',
    src: 'janux',
    run: async (log) => {
      const component = island({ view: () => null, intents: { go: act({ run: () => 'done' }) } } as never);
      const instance = createInstance(component as never, {
        onAudit: () => { throw new Error('sink down'); },
      });

      await attempt(log, 'call', () => instance.intents.go!());
    },
    expected: ['call:threw:sink down'],
  },
  {
    id: 'intent-no-audit-hook-means-no-bookkeeping-cost-and-no-behaviour-change',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: () => log.push('ran') }) } });

      await instance.intents.go!();
      log.push('done');
    },
    expected: ['ran', 'done'],
  },

  // ── settled() ──────────────────────────────────────────────────────────────
  {
    id: 'intent-settled-resolves-immediately-when-nothing-is-in-flight',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: () => undefined }) } });

      await instance.settled();
      log.push('settled');
    },
    expected: ['settled'],
  },
  {
    id: 'intent-settled-waits-for-an-async-run-to-finish',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          slow: act({
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              log.push('ran');
            },
          }),
        },
      });

      void instance.intents.slow!();
      await instance.settled();
      log.push('settled');
    },
    expected: ['ran', 'settled'],
  },
  {
    id: 'intent-settled-waits-for-every-concurrent-call-not-just-the-first',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          wait: act({
            input: schema({ ms: int() }),
            run: async ({ input }) => {
              await new Promise((resolve) => setTimeout(resolve, (input as { ms: number }).ms));
              log.push(`ran:${(input as { ms: number }).ms}`);
            },
          }),
        },
      });

      void instance.intents.wait!({ ms: 5 });
      void instance.intents.wait!({ ms: 20 });
      await instance.settled();
      log.push('settled');
    },
    expected: ['ran:5', 'ran:20', 'settled'],
  },
  {
    id: 'intent-settled-does-not-return-between-two-chained-async-stages',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          first: act({
            run: async ({ intents }) => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              log.push('first');
              await intents.second!();
            },
          }),
          second: act({
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              log.push('second');
            },
          }),
        },
      });

      void instance.intents.first!();
      await instance.settled();
      log.push('settled');
    },
    expected: ['first', 'second', 'settled'],
  },
  {
    id: 'intent-a-failed-async-run-still-lets-settled-resolve',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          boom: act({
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              throw new Error('nope');
            },
          }),
        },
      });

      await attempt(log, 'call', () => instance.intents.boom!());
      await instance.settled();
      log.push('settled');
    },
    expected: ['call:threw:nope', 'settled'],
  },
  {
    id: 'intent-the-resource-view-reports-pending-while-work-is-in-flight',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          slow: act({
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
            },
          }),
        },
      });

      const work = instance.intents.slow!();

      log.push(`during:${(instance.resource() as { sync: string }).sync}`);
      await work;
      log.push(`after:${(instance.resource() as { sync: string }).sync}`);
    },
    expected: ['during:pending', 'after:idle'],
  },
  {
    id: 'intent-settled-can-be-awaited-twice-and-answers-both-times',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { go: act({ run: async () => undefined }) } });

      await Promise.all([instance.settled(), instance.settled()]);
      log.push('both');
    },
    expected: ['both'],
  },
  {
    id: 'intent-work-started-after-settled-resolved-is-not-retroactively-waited-for',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          slow: act({
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, 15));
              log.push('ran');
            },
          }),
        },
      });

      await instance.settled();
      log.push('settled');
      await instance.intents.slow!();
    },
    expected: ['settled', 'ran'],
  },
  {
    id: 'intent-a-proposal-is-not-in-flight-work-so-settled-does-not-wait-for-approval',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        intents: {
          go: act({
            guard: 'confirm',
            run: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              log.push('ran');
            },
          }),
        },
      });

      await instance.intents.go!(undefined, { origin: 'agent' });
      await instance.settled();
      log.push('settled');
    },
    expected: ['settled'],
  },
  {
    id: 'intent-emitting-a-declared-event-from-a-run-body-reaches-the-bus',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        emits: { picked: schema({ id: str() }) },
        intents: { pick: act({ run: ({ emit }) => emit('picked', { id: 'p1' }) }) },
      });

      await instance.intents.pick!();
      log.push('done');
    },
    expected: ['done'],
  },
  {
    id: 'intent-emitting-an-undeclared-event-fails-the-call-that-tried',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, { intents: { pick: act({ run: ({ emit }) => emit('nope', {}) }) } });

      await attempt(log, 'call', () => instance.intents.pick!());
    },
    expected: ['call:threw:Janux: "w" does not declare event "nope"'],
  },
  {
    id: 'intent-emitting-a-payload-the-event-schema-refuses-fails-the-call',
    src: 'janux',
    run: async (log) => {
      const instance = open(log, {
        emits: { picked: schema({ id: str() }) },
        intents: { pick: act({ run: ({ emit }) => emit('picked', { id: 7 }) }) },
      });

      await attempt(log, 'call', () => instance.intents.pick!());
    },
    expected: ['call:threw:Janux: invalid payload for "picked"'],
  },
];
