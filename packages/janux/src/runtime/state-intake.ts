import { buildDefault, validate } from '../schema';
import { withGate, type MutationGate } from '../state/mutation-gate';
import type { ReactiveState } from '../state/reactive-state';
import type { ComponentDef } from '../define/types';

/**
 * The two doors untrusted state comes through, and the schema check both need.
 *
 * A snapshot rides inside the served HTML and is read back on resume; a patch comes
 * from `persistStore`, which reads `localStorage` — a store the user owns outright.
 * Neither was validated, so an undeclared `isAdmin: true` became real state and a
 * declared `int()` field accepted a string. The same state is what a `ui://`
 * resource shows the agent, so a poisoned one lied to both faces at once, against a
 * documented promise that state is schema-typed JSON.
 */

type Bag = Record<string, unknown>;

/** Defaults when there is no snapshot, and when the one offered cannot be trusted. */
export function resolveInitial(def: ComponentDef, initial?: Bag): Bag {
  if (!def.state) return initial ?? {};
  const defaults = () => buildDefault(def.state!) as Bag;

  if (initial === undefined) return defaults();
  const result = validate(def.state, initial);

  if (result.ok) return result.value as Bag;
  console.warn(`Janux: discarded an invalid state snapshot for "${def.name}" — ${result.errors[0]?.message}`);

  return defaults();
}

/**
 * Merges the patch onto current state and validates the whole thing, so an
 * undeclared key is stripped and a wrongly typed one rejects the payload.
 *
 * The previous guard was `field in state.proxy`, which walks the *prototype chain*
 * — `toString` and `constructor` passed it and landed as own properties — and it
 * never looked at the value at all.
 */
export function applyPatch(
  def: ComponentDef,
  state: ReactiveState<Bag>,
  gate: MutationGate,
  values: Bag,
): void {
  if (!def.state) return;
  const result = validate(def.state, { ...state.snapshot(), ...values });

  if (!result.ok) {
    console.warn(`Janux: discarded an invalid state patch for "${def.name}" — ${result.errors[0]?.message}`);

    return;
  }
  writeFields(state, gate, values, result.value as Bag);
}

/** Only the fields the caller named, so paths it never mentioned do not notify. */
function writeFields(state: ReactiveState<Bag>, gate: MutationGate, values: Bag, clean: Bag): void {
  withGate(gate, () => {
    Object.keys(values)
      .filter((field) => Object.hasOwn(clean, field))
      .forEach((field) => ((state.proxy as Bag)[field] = clean[field]));
  });
}
