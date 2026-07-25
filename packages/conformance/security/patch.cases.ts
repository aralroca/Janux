import { component, createInstance, int, intent, jsx, schema, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * `instance.patch` — the rehydration door.
 *
 * `persistStore` reads a payload out of `localStorage` and hands it straight to
 * `patch`, and localStorage is fully user-controlled: DevTools, a shared machine, or
 * any XSS on the origin. So a patch is untrusted input in exactly the way a state
 * snapshot is, and it had two holes the snapshot fix did not cover.
 *
 * The old guard was `field in state.proxy`, which checks the *prototype chain* — so
 * `toString` and `constructor` passed it and were written as own properties — and it
 * never looked at the value at all, so a declared `int()` field happily took a
 * string.
 */

const prefs = component({
  name: 'prefs',
  state: schema({ n: int(), label: str() }),
  intents: { bump: intent({ description: 'Bump', run: ({ state }) => (state.n += 1) }) },
  view: () => jsx('div', {}),
});

/** Patches a fresh instance and reports the resulting state, plus whether it warned. */
function patched(values: Record<string, unknown>): string {
  const warnings: string[] = [];
  const original = console.warn;

  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
  try {
    const instance = createInstance(prefs, {} as never);

    instance.patch(values);

    return `${JSON.stringify(instance.snapshot())}${warnings.length > 0 ? ' warned' : ''}`;
  } finally {
    console.warn = original;
  }
}

const DEFAULTS = '{"n":0,"label":""}';

export const PATCH_CASES: ScenarioCase[] = [
  {
    id: 'patch-applies-a-valid-value',
    src: 'janux',
    run: (log) => {
      log.push(patched({ n: 5, label: 'ok' }));
    },
    expected: ['{"n":5,"label":"ok"}'],
  },
  {
    id: 'patch-applies-only-the-fields-it-was-given',
    src: 'janux',
    run: (log) => {
      log.push(patched({ n: 5 }));
    },
    expected: ['{"n":5,"label":""}'],
  },
  {
    id: 'patch-ignores-an-undeclared-field',
    src: 'janux',
    run: (log) => {
      log.push(patched({ isAdmin: true }));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'patch-refuses-a-wrongly-typed-value-on-a-declared-field',
    src: 'janux',
    run: (log) => {
      log.push(patched({ n: 'not-a-number' }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'patch-refuses-an-object-where-a-number-is-declared',
    src: 'janux',
    run: (log) => {
      log.push(patched({ n: { nested: true } }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'patch-refuses-null-on-a-non-nullable-field',
    src: 'janux',
    run: (log) => {
      log.push(patched({ label: null }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'patch-refuses-the-whole-payload-when-one-field-is-invalid',
    src: 'janux',
    run: (log) => {
      log.push(patched({ n: 5, label: 42 }));
    },
    expected: [`${DEFAULTS} warned`],
  },
  {
    id: 'patch-does-not-write-a-prototype-inherited-name',
    src: 'janux',
    run: (log) => {
      log.push(patched({ toString: 'hijacked' }));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'patch-does-not-write-constructor',
    src: 'janux',
    run: (log) => {
      log.push(patched({ constructor: 'hijacked' }));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'patch-does-not-write-valueof',
    src: 'janux',
    run: (log) => {
      log.push(patched({ valueOf: 'hijacked' }));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'patch-does-not-write-hasownproperty',
    src: 'janux',
    run: (log) => {
      log.push(patched({ hasOwnProperty: 'hijacked' }));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'patch-leaves-the-prototype-clean-for-a-proto-payload',
    src: 'janux',
    run: (log) => {
      log.push(patched(JSON.parse('{"__proto__":{"polluted":true}}')));
      log.push(`prototype=${String(({} as Record<string, unknown>).polluted)}`);
    },
    expected: [DEFAULTS, 'prototype=undefined'],
  },
  {
    id: 'patch-of-an-empty-payload-changes-nothing',
    src: 'janux',
    run: (log) => {
      log.push(patched({}));
    },
    expected: [DEFAULTS],
  },
  {
    id: 'patch-keeps-the-state-usable-after-refusing-one',
    src: 'janux',
    run: async (log) => {
      const original = console.warn;

      console.warn = () => {};
      const instance = createInstance(prefs, {} as never);

      instance.patch({ n: 'bad' });
      console.warn = original;
      await instance.intents.bump!(undefined, { origin: 'human' });
      log.push(String(instance.state.n));
    },
    expected: ['1'],
  },
];
