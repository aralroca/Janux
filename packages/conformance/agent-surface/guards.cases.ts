import { component, createInstance, intent, int, jsx, schema, str, type AuditEntry, type Proposal } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The invocation pipeline both faces share.
 *
 * "A human click and an agent tool call run the exact same pipeline" is Janux's
 * central claim, so the rows that matter are the ones where the two must diverge —
 * `confirm` proposing instead of running, `forbidden` refusing — and the audit
 * trail that has to tell those apart.
 */

interface Recorded {
  audits: AuditEntry[];
  proposals: Proposal[];
}

/** A counter whose `bump` is auto, `reset` needs confirming and `wipe` is closed to agents. */
function counter(guard?: unknown) {
  return component({
    name: 'counter',
    description: 'A counter',
    state: schema({ n: int() }),
    intents: {
      bump: intent({
        description: 'Add to the counter',
        input: schema({ by: int().default(1) }),
        run: ({ state, input }) => (state.n += (input as { by: number }).by),
      }),
      reset: intent({ description: 'Reset it', guard: 'confirm', run: ({ state }) => (state.n = 0) }),
      wipe: intent({ description: 'Wipe it', guard: 'forbidden', run: ({ state }) => (state.n = -1) }),
      dynamic: intent({ description: 'Guard decided at call time', guard: guard as never, run: () => 'ran' }),
      needsReady: intent({
        description: 'Only when positive',
        ready: ({ state }) => (state as { n: number }).n > 0,
        run: () => 'ready',
      }),
    },
    view: () => jsx('div', {}),
  });
}

function mounted(guard?: unknown): { instance: ReturnType<typeof createInstance>; recorded: Recorded } {
  const recorded: Recorded = { audits: [], proposals: [] };
  const instance = createInstance(counter(guard), {
    onAudit: (entry: AuditEntry) => recorded.audits.push(entry),
    onProposal: (proposal: Proposal) => recorded.proposals.push(proposal),
  } as never);

  return { instance, recorded };
}

/** `tool guard origin ok proposed` — the audit line, flattened for comparison. */
const line = (entry: AuditEntry) =>
  `${entry.tool} ${entry.guard} ${entry.origin} ok=${entry.ok}${entry.proposed ? ' proposed' : ''}`;

export const GUARD_CASES: ScenarioCase[] = [
  // ── auto runs for both faces ────────────────────────────────────────────────
  {
    id: 'guard-auto-runs-for-a-human',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.bump!({ by: 2 }, { origin: 'human' });
      log.push(`n=${instance.state.n}`, ...recorded.audits.map(line));
    },
    expected: ['n=2', 'counter.bump auto human ok=true'],
  },
  {
    id: 'guard-auto-runs-for-an-agent',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.bump!({ by: 3 }, { origin: 'agent' });
      log.push(`n=${instance.state.n}`, ...recorded.audits.map(line));
    },
    expected: ['n=3', 'counter.bump auto agent ok=true'],
  },
  {
    id: 'guard-auto-applies-the-input-default',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await instance.intents.bump!({}, { origin: 'agent' });
      log.push(`n=${instance.state.n}`);
    },
    expected: ['n=1'],
  },
  {
    id: 'guard-undeclared-input-fields-are-stripped',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.bump!({ by: 1, extra: 'nope' }, { origin: 'agent' });
      log.push(JSON.stringify(recorded.audits[0]!.input));
    },
    expected: ['{"by":1}'],
  },

  // ── confirm diverges by origin, which is the whole point ────────────────────
  {
    id: 'guard-confirm-runs-immediately-for-a-human',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.bump!({ by: 5 }, { origin: 'human' });
      await instance.intents.reset!(undefined, { origin: 'human' });
      log.push(`n=${instance.state.n}`, `proposals=${recorded.proposals.length}`);
    },
    expected: ['n=0', 'proposals=0'],
  },
  {
    id: 'guard-confirm-proposes-for-an-agent-without-running',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.bump!({ by: 5 }, { origin: 'human' });
      const result = (await instance.intents.reset!(undefined, { origin: 'agent' })) as { status: string };

      log.push(`status=${result.status}`, `n=${instance.state.n}`, `proposals=${recorded.proposals.length}`);
    },
    expected: ['status=proposal', 'n=5', 'proposals=1'],
  },
  {
    id: 'guard-a-proposal-executes-only-when-approved',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.bump!({ by: 5 }, { origin: 'human' });
      await instance.intents.reset!(undefined, { origin: 'agent' });
      log.push(`before=${instance.state.n}`);
      await recorded.proposals[0]!.execute();
      log.push(`after=${instance.state.n}`);
    },
    expected: ['before=5', 'after=0'],
  },
  {
    id: 'guard-an-agent-proposal-is-audited-as-proposed-not-as-a-success',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.reset!(undefined, { origin: 'agent' });
      log.push(...recorded.audits.map(line));
    },
    expected: ['counter.reset confirm agent ok=true proposed'],
  },
  {
    id: 'guard-proposal-ids-are-not-guessable',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.reset!(undefined, { origin: 'agent' });
      await instance.intents.reset!(undefined, { origin: 'agent' });
      const [first, second] = recorded.proposals.map((proposal) => proposal.id);

      log.push(`distinct=${first !== second}`, `long=${first!.length > 20}`, `sequential=${second === first!.replace(/\d+$/, (n) => String(Number(n) + 1))}`);
    },
    expected: ['distinct=true', 'long=true', 'sequential=false'],
  },
  {
    id: 'guard-an-intent-without-an-input-schema-receives-nothing',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await instance.intents.reset!({ extra: 'smuggled' }, { origin: 'agent' });
      log.push(`input=${String(recorded.proposals[0]!.input)}`);
    },
    expected: ['input=undefined'],
  },

  // ── forbidden ───────────────────────────────────────────────────────────────
  {
    id: 'guard-forbidden-refuses-an-agent',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await attempt(log, 'wipe', () => instance.intents.wipe!(undefined, { origin: 'agent' }));
      log.push(`n=${instance.state.n}`, ...recorded.audits.map(line));
    },
    expected: [
      'wipe:threw:Intent "counter.wipe" is not available',
      'n=0',
      'counter.wipe forbidden agent ok=false',
    ],
  },
  {
    id: 'guard-forbidden-still-runs-for-a-human-on-their-own-ui',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await instance.intents.wipe!(undefined, { origin: 'human' });
      log.push(`n=${instance.state.n}`);
    },
    expected: ['n=-1'],
  },

  // ── a guard function decides per call ───────────────────────────────────────
  {
    id: 'guard-function-returning-auto-runs',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(() => 'auto');

      log.push(String(await instance.intents.dynamic!(undefined, { origin: 'agent' })));
    },
    expected: ['ran'],
  },
  {
    id: 'guard-function-returning-forbidden-refuses',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(() => 'forbidden');

      await attempt(log, 'call', () => instance.intents.dynamic!(undefined, { origin: 'agent' }));
    },
    expected: ['call:threw:Intent "counter.dynamic" is not available'],
  },
  {
    id: 'guard-function-returning-confirm-proposes',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(() => 'confirm');
      const result = (await instance.intents.dynamic!(undefined, { origin: 'agent' })) as { status: string };

      log.push(result.status);
    },
    expected: ['proposal'],
  },
  {
    id: 'guard-function-that-throws-denies-instead-of-propagating',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(() => {
        throw new Error('guard blew up');
      });

      await attempt(log, 'call', () => instance.intents.dynamic!(undefined, { origin: 'agent' }));
    },
    expected: ['call:threw:Intent "counter.dynamic" is not available'],
  },

  // ── readiness and validation reach both faces alike ────────────────────────
  {
    id: 'guard-a-not-ready-intent-refuses-an-agent',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await attempt(log, 'call', () => instance.intents.needsReady!(undefined, { origin: 'agent' }));
    },
    expected: ['call:threw:Intent "counter.needsReady" is not ready'],
  },
  {
    id: 'guard-a-not-ready-intent-refuses-a-human-too',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await attempt(log, 'call', () => instance.intents.needsReady!(undefined, { origin: 'human' }));
    },
    expected: ['call:threw:Intent "counter.needsReady" is not ready'],
  },
  {
    id: 'guard-a-ready-intent-runs-once-its-condition-holds',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await instance.intents.bump!({ by: 1 }, { origin: 'human' });
      log.push(String(await instance.intents.needsReady!(undefined, { origin: 'agent' })));
    },
    expected: ['ready'],
  },
  {
    id: 'guard-invalid-input-is-refused-for-an-agent',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await attempt(log, 'call', () => instance.intents.bump!({ by: 'lots' }, { origin: 'agent' }));
    },
    expected: ['call:threw:Invalid input for "counter.bump" — by: expected int'],
  },
  {
    id: 'guard-invalid-input-is-refused-for-a-human-too',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted();

      await attempt(log, 'call', () => instance.intents.bump!({ by: 1.5 }, { origin: 'human' }));
    },
    expected: ['call:threw:Invalid input for "counter.bump" — by: expected int'],
  },
  {
    id: 'guard-a-failed-call-is-audited-with-the-raw-input',
    src: 'janux',
    run: async (log) => {
      const { instance, recorded } = mounted();

      await attempt(log, 'call', () => instance.intents.bump!({ by: 'lots' }, { origin: 'agent' }));
      log.push(`ok=${recorded.audits[0]!.ok}`, JSON.stringify(recorded.audits[0]!.input));
    },
    expected: ['call:threw:Invalid input for "counter.bump" — by: expected int', 'ok=false', '{"by":"lots"}'],
  },
  {
    id: 'guard-a-throwing-run-is-audited-as-a-failure',
    src: 'janux',
    run: async (log) => {
      const recorded: AuditEntry[] = [];
      const def = component({
        name: 'boom',
        state: schema({ s: str() }),
        intents: {
          go: intent({
            description: 'Throws',
            run: () => {
              throw new Error('inner');
            },
          }),
        },
        view: () => jsx('div', {}),
      });
      const instance = createInstance(def, { onAudit: (entry: AuditEntry) => recorded.push(entry) } as never);

      await attempt(log, 'call', () => instance.intents.go!(undefined, { origin: 'agent' }));
      log.push(`ok=${recorded[0]!.ok}`, `error=${recorded[0]!.error}`);
    },
    expected: ['call:threw:inner', 'ok=false', 'error=Error: inner'],
  },
];
