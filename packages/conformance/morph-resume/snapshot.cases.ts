import { component, createInstance, int, intent, jsx, list, schema, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Resuming from a state snapshot.
 *
 * The snapshot is untrusted input: it rides inside the served HTML and is read back
 * on resume, so anything able to influence that markup gets a say in state — and
 * the same state is what a `ui://` resource shows the agent. "State is
 * schema-typed JSON" has to hold at the moment it is read, not only when it is
 * written.
 */

const counter = component({
  name: 'counter',
  state: schema({ n: int(), label: str().default('hi'), items: list({ id: str() }) }),
  intents: { bump: intent({ description: 'Add one', run: ({ state }) => (state.n += 1) }) },
  view: () => jsx('div', {}),
});

const stateless = component({ name: 'plain', intents: {}, view: () => jsx('div', {}) });

/** Resumes from `initial` and reports the state that survived. */
function resumed(initial?: unknown): string {
  const warnings: string[] = [];
  const original = console.warn;

  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
  try {
    const snapshot = createInstance(counter, { initial } as never).snapshot();

    return `${JSON.stringify(snapshot)}${warnings.length > 0 ? ' warned' : ''}`;
  } finally {
    console.warn = original;
  }
}

const DEFAULTS = '{"n":0,"label":"hi","items":[]}';

export const SNAPSHOT_CASES: ScenarioCase[] = [
  {
    id: 'snapshot-a-valid-one-is-restored-as-is',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ n: 7, label: 'seven', items: [{ id: 'a' }] }));
    },
    expected: ['{"n":7,"label":"seven","items":[{"id":"a"}]}'],
  },
  {
    id: 'snapshot-absent-falls-back-to-schema-defaults',
    src: 'janux',
    run: (log) => {
      log.push(resumed(undefined));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'snapshot-an-undeclared-key-never-becomes-state',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ n: 1, label: 'a', items: [], isAdmin: true }));
    },
    expected: ['{"n":1,"label":"a","items":[]}'],
  },
  {
    id: 'snapshot-a-proto-key-never-becomes-state',
    src: 'janux',
    run: (log) => {
      log.push(resumed(JSON.parse('{"n":1,"label":"a","items":[],"__proto__":{"polluted":true}}')));
    },
    expected: ['{"n":1,"label":"a","items":[]}'],
  },
  {
    id: 'snapshot-a-wrongly-typed-field-discards-the-whole-snapshot',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ n: 'not-a-number', label: 'a', items: [] }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'snapshot-a-string-where-a-list-belongs-is-discarded',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ n: 1, label: 'a', items: 'nope' }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'snapshot-a-missing-required-field-discards-it',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ label: 'a' }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'snapshot-an-array-cannot-replace-the-state-object',
    src: 'janux',
    run: (log) => {
      log.push(resumed([1, 2, 3]));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'snapshot-null-is-treated-as-no-snapshot-at-all',
    src: 'janux',
    run: (log) => {
      log.push(resumed(null));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'snapshot-a-bad-list-item-discards-it',
    src: 'janux',
    run: (log) => {
      log.push(resumed({ n: 1, label: 'a', items: [{ id: 5 }] }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'snapshot-a-restored-state-is-still-writable-through-an-intent',
    src: 'janux',
    run: async (log) => {
      const instance = createInstance(counter, { initial: { n: 4, label: 'a', items: [] } } as never);

      await instance.intents.bump!(undefined, { origin: 'human' });
      log.push(String(instance.state.n));
    },
    expected: ['5'],
  },
  {
    id: 'snapshot-a-discarded-one-still-leaves-a-usable-instance',
    src: 'janux',
    run: async (log) => {
      const original = console.warn;

      console.warn = () => {};
      const instance = createInstance(counter, { initial: { n: 'bad' } } as never);

      console.warn = original;
      await instance.intents.bump!(undefined, { origin: 'human' });
      log.push(String(instance.state.n));
    },
    expected: ['1'],
  },
  {
    id: 'snapshot-a-stateless-component-accepts-anything-because-it-declares-nothing',
    src: 'janux',
    run: (log) => {
      log.push(JSON.stringify(createInstance(stateless, { initial: { any: 'thing' } } as never).snapshot()));
    },
    expected: ['{"any":"thing"}'],
  },
];
