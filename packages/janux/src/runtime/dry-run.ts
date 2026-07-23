import { createReactiveState } from '../state/reactive-state';
import { createGate, withGate } from '../state/mutation-gate';
import type { IntentDef, RunBag } from '../define/types';

export interface StateDiff {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Proposal visual diff (RFC 0002 §15): run the intent against a SHADOW copy of
 * the state so a human approves an outcome, not an opaque call. Only for pure
 * client intents — `server`-backed ones (and anything that throws in the
 * shadow) fall back to showing the input alone.
 */
export function dryRunDiff(def: IntentDef, bag: RunBag, input: unknown): StateDiff | undefined {
  if (def.server) return undefined;
  try {
    const before = JSON.parse(JSON.stringify(bag.state)) as Record<string, unknown>;
    const gate = createGate();
    const shadow = createReactiveState(structuredClone(before), gate);
    const shadowBag: RunBag = {
      ...bag,
      state: shadow.proxy,
      emit: () => {},
      intents: {},
    };
    const result = withGate(gate, () => def.run({ ...shadowBag, input }));

    // Async intents may keep mutating after we snapshot — refuse rather than lie.
    if (result instanceof Promise) return undefined;

    return { before, after: shadow.snapshot() };
  } catch {
    return undefined;
  }
}
