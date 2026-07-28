import type {
  ComponentDef,
  ComponentTag,
  EffectDef,
  IntentDef,
  RefreshPolicy,
  SourceDef,
} from './types';

type ComponentInput = Omit<ComponentDef, 'kind'>;
type StoreInput = Omit<ComponentDef, 'kind' | 'view'>;

function assertName(name: unknown, kind: string): void {
  if (typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name)) return;

  throw new Error(`Janux: ${kind} needs a kebab-case "name", got ${JSON.stringify(name)}`);
}

/** An intent name becomes half of `component.intent`, and `__` is reserved for wire names. */
const INTENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const NAME_PROBLEM = {
  separator: 'may not contain "." — it separates the component from the intent in a tool name',
  identifier: 'must be a plain identifier — it becomes part of an agent tool name',
};

function intentNameProblem(name: string): keyof typeof NAME_PROBLEM | undefined {
  if (name.includes('.')) return 'separator';
  if (!INTENT_NAME.test(name) || name.includes('__')) return 'identifier';

  return undefined;
}

/**
 * An intent name is addressable: an agent calls `component.intent`, and the client
 * bridge splits on the dot to resolve it. Left unvalidated, a name containing a dot
 * made that namespace ambiguous — `cart` with an `auto` intent `pay` and a
 * `forbidden` intent `pay.now` let a call to the *forbidden* `cart.pay.now` resolve
 * to `cart.pay` and run it. The separator is rejected where the name is declared,
 * so the ambiguity cannot exist rather than being parsed around.
 */
function assertIntentNames(def: { name: string; intents?: Record<string, unknown> }): void {
  Object.keys(def.intents ?? {}).forEach((name) => {
    const problem = intentNameProblem(name);

    if (problem) throw new Error(`Janux: intent name "${name}" in component "${def.name}" ${NAME_PROBLEM[problem]}`);
  });
}

/** `suspense`/`error` are views too: anything else would throw mid-render. */
function assertBoundaryViews(def: ComponentInput): void {
  (['suspense', 'error'] as const).forEach((name) => {
    if (def[name] !== undefined && typeof def[name] !== 'function') {
      throw new Error(`Janux: component "${def.name}" ${name} must be a function`);
    }
  });
}

/** Defines a bifacial component: view for humans, resource+tools for agents. */
export function component(def: ComponentInput): ComponentTag {
  assertName(def.name, 'component()');
  assertIntentNames(def);
  if (typeof def.view !== 'function') {
    throw new Error(`Janux: component "${def.name}" requires a view`);
  }
  assertBoundaryViews(def);

  return Object.freeze({ ...def, kind: 'component' as const }) as ComponentTag;
}

/** Defines a shared store: a bifacial component without a view. */
export function store(def: StoreInput): ComponentDef {
  assertName(def.name, 'store()');
  assertIntentNames(def);

  return Object.freeze({ ...def, kind: 'store' as const, scope: def.scope ?? 'app' });
}

export function intent(def: IntentDef): IntentDef {
  if (typeof def.run !== 'function') throw new Error('Janux: intent() requires run()');

  return def;
}

export function effect(def: EffectDef): EffectDef {
  if (typeof def.run !== 'function') throw new Error('Janux: effect() requires run()');

  return def;
}

export function source(def: SourceDef): SourceDef {
  if (typeof def.query !== 'function') throw new Error('Janux: source() requires query()');

  return def;
}

/** A refresh policy that can keep collecting event triggers: `.orOn(a).orOn(b)`. */
export type ChainableRefreshPolicy = RefreshPolicy & { orOn: (event: string) => ChainableRefreshPolicy };

/** Every `orOn` returns a new policy, so a shared base is safe to reuse. */
function chainable(policy: RefreshPolicy): ChainableRefreshPolicy {
  return {
    ...policy,
    orOn: (event: string) => chainable({ ...policy, events: [...policy.events, event] }),
  };
}

/** Refresh policy builder: `every('5m').orOn('inventory.changed')`. */
export function every(interval: string): ChainableRefreshPolicy {
  const everyMs = parseDuration(interval);

  // `sources.ts` hands this straight to `setInterval`, so zero is an unbounded
  // request flood from every client that mounts the island — and `every('0s')` is
  // a reachable way to write "no delay".
  if (everyMs <= 0) throw new Error(`Janux: refresh interval "${interval}" must be greater than zero`);

  return chainable({ everyMs, events: [] });
}

/** Event-only refresh policy: `on('inventory.changed')`. */
export function onEvent(event: string): RefreshPolicy {
  return { events: [event] };
}

const DURATION_UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

export function parseDuration(input: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(input);

  if (!match) throw new Error(`Janux: invalid duration "${input}" (use e.g. 300ms, 2s, 5m, 1h)`);

  return Number(match[1]) * DURATION_UNITS[match[2]!]!;
}
