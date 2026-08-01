import { api, collectApis, invokeApi, type ApiTool } from '@janux/server';
import { int, schema, str } from 'janux';
import { setOnError, setPiiFilter, setTracer, type ErrorInfo, type JanuxTracer } from 'janux/observability';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * What an `api()` call tells the outside world while it runs.
 *
 * Observability is a security surface twice over. It is where a refusal becomes
 * *visible* — a forged call that nothing records is a forged call nobody reviews —
 * and it is where request data *leaves* the process, so an attribute carrying an
 * email or a `data:` payload is an exfiltration channel with a dashboard attached.
 *
 * The rows pin both halves: the span every call opens (name, and the four
 * attributes that let one query span the whole agent surface), and the discipline
 * around it — a refusal is not an app error, a broken exporter is not an outage,
 * and a string attribute is scrubbed on the way out.
 */

const first = (mod: Record<string, unknown>, namespace = 'shop'): ApiTool => collectApis({ [namespace]: mod })[0]!;

/** Collects `name {attributes}` per span, plus `error:` lines a span recorded. */
function recorder(log: string[]): JanuxTracer {
  return {
    span: (name, attributes, run) => {
      log.push(`${name} ${JSON.stringify(attributes)}`);

      return run({
        setAttributes: (extra) => log.push(`attrs ${JSON.stringify(extra)}`),
        recordError: (error) => log.push(`error ${String(error)}`),
      });
    },
  };
}

/** Runs `body` with a tracer installed, and always removes it again. */
async function traced(log: string[], body: () => Promise<unknown>, tracer?: JanuxTracer): Promise<void> {
  setTracer(tracer ?? recorder(log));
  try {
    await body().catch((error) => log.push(`threw ${String(error)}`));
  } finally {
    setTracer(undefined);
  }
}

/** Runs `body` with an error sink installed, logging `phase intent origin` per report. */
async function watched(log: string[], body: () => Promise<unknown>): Promise<void> {
  const seen = (error: unknown, info: ErrorInfo) =>
    log.push(`report ${info.phase}/${info.intent}/${info.origin}/${info.level} ${String(error)}`);

  setOnError(seen);
  try {
    await body().catch((error) => log.push(`threw ${String(error)}`));
  } finally {
    setOnError(() => undefined);
  }
}

const plain = () => first({ s: api({ description: 'd', run: () => 'ran' }) });
const strict = () => first({ s: api({ description: 'd', input: schema({ q: str() }), run: () => 'ran' }) });
const broken = () => first({ s: api({ description: 'd', run: () => { throw new Error('kaboom'); } }) });

export const OBSERVABILITY_CASES: ScenarioCase[] = [
  // ── the span ────────────────────────────────────────────────────────────────
  {
    id: 'rpc-span-a-call-opens-one-named-janux-api',
    src: 'janux',
    run: (log) => traced(log, () => invokeApi(plain(), {}, {}, 'agent')),
    expected: ['janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent"}'],
  },
  {
    id: 'rpc-span-carries-the-origin-it-was-invoked-with',
    src: 'janux',
    run: (log) => traced(log, () => invokeApi(plain(), {}, {}, 'human')),
    expected: ['janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"human"}'],
  },
  {
    id: 'rpc-span-carries-the-resolved-guard-not-the-declared-one',
    src: 'janux',
    run: (log) => {
      const gated = first({ s: api({ description: 'd', guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'), run: () => 1 }) });

      return traced(log, () => invokeApi(gated, {}, {}, 'agent'));
    },
    expected: ['janux.api {"janux.intent":"api.shop.s","janux.guard":"confirm","janux.origin":"agent"}'],
  },
  {
    // An `undefined` attribute is dropped rather than exported as the string
    // "undefined", so a query for `janux.proposal.id` finds proposals and not
    // every call that never had one.
    id: 'rpc-span-omits-the-proposal-id-when-there-is-no-proposal',
    src: 'janux',
    run: async (log) => {
      await traced(log, () => invokeApi(plain(), {}, {}, 'agent'));
      log.push(`mentions-proposal=${log.some((line) => line.includes('proposal'))}`);
    },
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent"}',
      'mentions-proposal=false',
    ],
  },
  {
    id: 'rpc-span-an-approved-run-names-itself-and-links-the-proposal',
    src: 'janux',
    run: (log) =>
      traced(log, () => invokeApi(plain(), {}, {}, 'agent', undefined, { span: 'janux.api.execute', proposal: 'prop_api_x' })),
    expected: [
      'janux.api.execute {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent","janux.proposal.id":"prop_api_x"}',
    ],
  },
  {
    id: 'rpc-span-the-intent-name-matches-the-audit-tool-name',
    src: 'janux',
    run: (log) =>
      traced(log, () => invokeApi(collectApis({ billing: { charge: api({ description: 'd', run: () => 1 }) } })[0]!, {}, {}, 'agent')),
    expected: ['janux.api {"janux.intent":"api.billing.charge","janux.guard":"auto","janux.origin":"agent"}'],
  },
  {
    id: 'rpc-span-a-failure-is-recorded-on-the-span-and-still-thrown',
    src: 'janux',
    run: (log) => traced(log, () => invokeApi(broken(), {}, {}, 'agent')),
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent"}',
      'error Error: kaboom',
      'threw Error: kaboom',
    ],
  },
  {
    id: 'rpc-span-a-refusal-is-recorded-too',
    src: 'janux',
    run: (log) => traced(log, () => invokeApi(strict(), {}, {}, 'agent')),
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent"}',
      'error Error: Invalid input for "shop.s" — q: required',
      'threw Error: Invalid input for "shop.s" — q: required',
    ],
  },
  {
    id: 'rpc-span-a-forbidden-call-still-opens-a-span',
    src: 'janux',
    run: (log) => {
      const closed = first({ s: api({ description: 'd', guard: 'forbidden', run: () => 1 }) });

      return traced(log, () => invokeApi(closed, {}, {}, 'agent'));
    },
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"forbidden","janux.origin":"agent"}',
      'error Error: Tool "shop.s" is not available',
      'threw Error: Tool "shop.s" is not available',
    ],
  },
  {
    id: 'rpc-span-two-calls-open-two-spans',
    src: 'janux',
    run: async (log) => {
      const tool = plain();

      await traced(log, async () => {
        await invokeApi(tool, {}, {}, 'agent');
        await invokeApi(tool, {}, {}, 'human');
      });
    },
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent"}',
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"human"}',
    ],
  },
  {
    id: 'rpc-span-nothing-is-opened-when-no-tracer-is-registered',
    src: 'janux',
    run: async (log) => {
      log.push(String(await invokeApi(plain(), {}, {}, 'agent')));
    },
    expected: ['ran'],
  },

  // ── a broken exporter is not an outage ──────────────────────────────────────
  {
    id: 'rpc-span-a-tracer-that-throws-does-not-fail-the-call',
    src: 'janux',
    run: async (log) => {
      await traced(log, async () => log.push(String(await invokeApi(plain(), {}, {}, 'human'))), {
        span: () => {
          throw new Error('exporter down');
        },
      });
    },
    expected: ['ran'],
  },
  {
    id: 'rpc-span-a-tracer-that-rejects-does-not-fail-the-call',
    src: 'janux',
    run: async (log) => {
      await traced(log, async () => log.push(String(await invokeApi(plain(), {}, {}, 'human'))), {
        span: () => Promise.reject(new Error('exporter down later')),
      });
    },
    expected: ['ran'],
  },
  {
    id: 'rpc-span-a-tracer-that-throws-after-the-work-keeps-the-result',
    src: 'janux',
    run: async (log) => {
      await traced(log, async () => log.push(String(await invokeApi(plain(), {}, {}, 'human'))), {
        span: async (_name, _attributes, run) => {
          const value = await run({ setAttributes: () => undefined, recordError: () => undefined });

          throw new Error(`flush failed after ${String(value)}`);
        },
      });
    },
    expected: ['ran'],
  },
  {
    id: 'rpc-span-a-span-handle-that-throws-is-shielded',
    src: 'janux',
    run: async (log) => {
      await traced(log, async () => log.push(String(await invokeApi(broken(), {}, {}, 'human').catch((error) => String(error)))), {
        span: (_name, _attributes, run) =>
          run({
            setAttributes: () => {
              throw new Error('attr sink down');
            },
            recordError: () => {
              throw new Error('error sink down');
            },
          }),
      });
    },
    expected: ['Error: kaboom'],
  },

  // ── attributes leave the process, so they are scrubbed ──────────────────────
  {
    id: 'rpc-span-an-email-in-a-tool-name-is-redacted',
    src: 'janux',
    run: (log) =>
      traced(log, () =>
        invokeApi(collectApis({ 'mail-to-a.user@example.com': { send: api({ description: 'd', run: () => 1 }) } })[0]!, {}, {}, 'agent'),
      ),
    // The whole dotted name matches the email pattern, so the redaction takes the
    // tool name with it — the filter fails toward saying less, which is the right
    // direction for a value that is about to leave the process.
    expected: ['janux.api {"janux.intent":"[email]","janux.guard":"auto","janux.origin":"agent"}'],
  },
  {
    id: 'rpc-span-an-international-phone-number-is-redacted',
    src: 'janux',
    run: (log) =>
      traced(log, () => invokeApi(plain(), {}, {}, 'agent', undefined, { span: 'janux.api', proposal: 'called +34 600 000 000' })),
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent","janux.proposal.id":"called [phone]"}',
    ],
  },
  {
    id: 'rpc-span-a-data-url-is-truncated-to-a-length-marker',
    src: 'janux',
    run: (log) =>
      traced(log, () =>
        invokeApi(plain(), {}, {}, 'agent', undefined, { span: 'janux.api', proposal: `data:image/png;base64,${'A'.repeat(40)}` }),
      ),
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent","janux.proposal.id":"[data-url truncated, 62 chars]"}',
    ],
  },
  {
    id: 'rpc-span-a-bare-digit-run-is-kept-because-it-is-signal',
    src: 'janux',
    run: (log) => traced(log, () => invokeApi(plain(), {}, {}, 'agent', undefined, { span: 'janux.api', proposal: '1234567890' })),
    expected: [
      'janux.api {"janux.intent":"api.shop.s","janux.guard":"auto","janux.origin":"agent","janux.proposal.id":"1234567890"}',
    ],
  },
  {
    id: 'rpc-span-a-pii-filter-that-throws-redacts-rather-than-leaking',
    src: 'janux',
    run: async (log) => {
      setPiiFilter(() => {
        throw new Error('filter down');
      });
      try {
        await traced(log, () => invokeApi(plain(), {}, {}, 'agent', undefined, { span: 'janux.api', proposal: 'secret-value' }));
      } finally {
        setPiiFilter(undefined);
      }
    },
    expected: [
      // Every string attribute, not only the offending one: the filter is what
      // decides what may leave, and a filter that cannot run has decided nothing.
      'janux.api {"janux.intent":"[redacted: pii filter failed]","janux.guard":"[redacted: pii filter failed]","janux.origin":"[redacted: pii filter failed]","janux.proposal.id":"[redacted: pii filter failed]"}',
    ],
  },
  {
    id: 'rpc-span-an-app-supplied-filter-replaces-the-default',
    src: 'janux',
    run: async (log) => {
      setPiiFilter((value) => value.replaceAll('shop', 'REDACTED'));
      try {
        await traced(log, () => invokeApi(plain(), {}, {}, 'agent'));
      } finally {
        setPiiFilter(undefined);
      }
    },
    expected: ['janux.api {"janux.intent":"api.REDACTED.s","janux.guard":"auto","janux.origin":"agent"}'],
  },

  // ── what reaches the app's error sink ───────────────────────────────────────
  {
    id: 'rpc-error-a-real-failure-reaches-the-app-error-sink',
    src: 'janux',
    run: (log) => watched(log, () => invokeApi(broken(), {}, {}, 'agent')),
    expected: ['report invocation/api.shop.s/agent/error Error: kaboom', 'threw Error: kaboom'],
  },
  {
    id: 'rpc-error-an-invalid-input-does-not-reach-it',
    src: 'janux',
    run: (log) => watched(log, () => invokeApi(strict(), {}, {}, 'agent')),
    expected: ['threw Error: Invalid input for "shop.s" — q: required'],
  },
  {
    id: 'rpc-error-a-refusal-does-not-reach-it-either',
    src: 'janux',
    run: (log) => {
      const closed = first({ s: api({ description: 'd', guard: 'forbidden', run: () => 1 }) });

      return watched(log, () => invokeApi(closed, {}, {}, 'agent'));
    },
    expected: ['threw Error: Tool "shop.s" is not available'],
  },
  {
    id: 'rpc-error-an-invalid-output-is-a-real-failure',
    src: 'janux',
    run: (log) => {
      const wrong = first({ s: api({ description: 'd', output: schema({ n: int() }), run: () => ({ n: 'x' }) }) });

      return watched(log, () => invokeApi(wrong, {}, {}, 'human'));
    },
    expected: [
      'report invocation/api.shop.s/human/error Error: Janux: api "shop.s" returned an invalid output',
      'threw Error: Janux: api "shop.s" returned an invalid output',
    ],
  },
  {
    id: 'rpc-error-the-phase-is-always-invocation-for-an-api-call',
    src: 'janux',
    run: (log) => watched(log, () => invokeApi(broken(), {}, {}, 'human')),
    expected: ['report invocation/api.shop.s/human/error Error: kaboom', 'threw Error: kaboom'],
  },
  {
    id: 'rpc-error-a-thrown-non-error-is-reported-as-it-was-thrown',
    src: 'janux',
    run: (log) => {
      const odd = first({ s: api({ description: 'd', run: () => { throw { code: 'weird' }; } }) });

      return watched(log, () => invokeApi(odd, {}, {}, 'agent'));
    },
    expected: ['report invocation/api.shop.s/agent/error [object Object]', 'threw [object Object]'],
  },
  {
    id: 'rpc-error-an-error-sink-that-throws-does-not-change-what-the-caller-sees',
    src: 'janux',
    run: async (log) => {
      setOnError(() => {
        throw new Error('sink down');
      });
      try {
        await attempt(log, 'call', () => invokeApi(broken(), {}, {}, 'agent'));
      } finally {
        setOnError(() => undefined);
      }
    },
    expected: ['call:threw:kaboom'],
  },
  {
    id: 'rpc-error-a-successful-call-reports-nothing',
    src: 'janux',
    run: (log) => watched(log, () => invokeApi(plain(), {}, {}, 'agent')),
    expected: [],
  },
];
