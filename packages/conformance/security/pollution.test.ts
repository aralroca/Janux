import { afterEach, describe, expect } from 'bun:test';
import { component, createInstance, int, intent, jsx, list, obj, schema, str, translateCore, validate } from 'janux';
import { hashKey } from 'janux/query';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { createReactiveState } from '../../janux/src/state/reactive-state';
import { runCases } from '../support/scenario';
import { POLLUTION_CASES, type PollutionRow } from './pollution.cases';

/**
 * Every row drives one entry point with one attacker-controlled key and asserts:
 * `Object.prototype` gained nothing, and the key did not become declared data.
 *
 * The marker value is deliberately unique per row so a leak cannot be masked by an
 * earlier one, and `afterEach` removes anything that did land — a polluted
 * prototype would otherwise make every later test in the process suspect.
 */
const MARKER = 'jx_polluted_marker';

const target = component({
  name: 'target',
  state: schema({ n: int() }),
  intents: { take: intent({ description: 'x', input: schema({ n: int() }), run: () => {} }) },
  view: () => jsx('div', {}),
});

/** A JSON payload with `key` set to a pollution attempt, parsed so the key is real. */
function payload(key: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...extra, [key]: { [MARKER]: true } }));
}

async function drive(row: PollutionRow): Promise<unknown> {
  const { entry, key } = row;

  if (entry === 'schema-validate') return validate(schema({ n: int() }), payload(key, { n: 1 })).value;
  if (entry === 'schema-nested') return validate(schema({ o: obj({ n: int() }) }), { o: payload(key, { n: 1 }) }).value;
  if (entry === 'schema-list-item') return validate(schema({ xs: list({ n: int() }) }), { xs: [payload(key, { n: 1 })] }).value;
  if (entry === 'state-write') return writeThroughProxy(key);
  if (entry === 'state-initial') return createReactiveState(payload(key, { n: 1 })).snapshot();
  if (entry === 'snapshot-resume') return createInstance(target, { initial: payload(key, { n: 1 }) } as never).snapshot();
  if (entry === 'query-hash') return hashKey([payload(key)]);
  if (entry === 'intent-input') return takeIntent(key);

  return translateCore('en', {
    locales: ['en'],
    defaultLocale: 'en',
    messages: { en: { greet: `hi {{${key}}}` } },
  } as never)('greet' as never, payload(key) as never);
}

function writeThroughProxy(key: string): unknown {
  const gate = createGate();
  const state = createReactiveState<Record<string, unknown>>({ n: 1 }, gate);

  withGate(gate, () => ((state.proxy as Record<string, unknown>)[key] = { [MARKER]: true }));

  return state.snapshot();
}

async function takeIntent(key: string): Promise<unknown> {
  const instance = createInstance(target, {} as never);

  await instance.intents.take!(payload(key, { n: 1 }), { origin: 'agent' }).catch(() => undefined);

  return instance.snapshot();
}

afterEach(() => {
  // Nothing should have landed; if it did, remove it so later tests stay honest.
  delete (Object.prototype as Record<string, unknown>)[MARKER];
});

describe('prototype pollution per entry point', () =>
  runCases(POLLUTION_CASES, async (row) => {
    const result = await drive(row);

    // 1. The prototype chain of a fresh, unrelated object is clean.
    expect((({} as Record<string, unknown>)[MARKER])).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty(MARKER);

    // 2. A schema-backed path strips the undeclared key; a schemaless one carries
    //    it as ordinary data, which is not pollution — see STRIPS in the cases file.
    if (row.strips) expect(JSON.stringify(result ?? null)).not.toContain(MARKER);
  }));
