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

/** Defines a bifacial component: view for humans, resource+tools for agents. */
export function component(def: ComponentInput): ComponentTag {
  assertName(def.name, 'component()');
  if (typeof def.view !== 'function') {
    throw new Error(`Janux: component "${def.name}" requires a view`);
  }

  return Object.freeze({ ...def, kind: 'component' as const }) as ComponentTag;
}

/** Defines a shared store: a bifacial component without a view. */
export function store(def: StoreInput): ComponentDef {
  assertName(def.name, 'store()');

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
  return chainable({ everyMs: parseDuration(interval), events: [] });
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
