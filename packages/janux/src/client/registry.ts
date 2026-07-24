import type { ComponentDef } from '../define/types';
import type { ForeignDef } from '../interop';
import type { JanuxInstance } from '../runtime/instance';
import type { ForeignHandle } from './foreign';

export type IslandLoader = () => Promise<unknown>;

export interface ClientRegistry {
  defs: Map<string, ComponentDef>;
  loaders: Map<string, IslandLoader>;
  mounted: Map<string, JanuxInstance>;
  /** In-flight mounts, so concurrent triggers (double event, unbatched writes) share one instance. */
  mounting: Map<string, Promise<JanuxInstance>>;
  stores: Map<string, JanuxInstance>;
  snapshots: Map<string, Record<string, unknown>>;
  foreignDefs: Map<string, ForeignDef>;
  foreigns: Map<string, ForeignHandle>;
}

export function createClientRegistry(): ClientRegistry {
  return {
    defs: new Map(),
    loaders: new Map(),
    mounted: new Map(),
    mounting: new Map(),
    stores: new Map(),
    snapshots: new Map(),
    foreignDefs: new Map(),
    foreigns: new Map(),
  };
}

/** Island/store modules call this on import so boot can resolve defs by name. */
export function registerDef(registry: ClientRegistry, def: ComponentDef | ForeignDef): void {
  if ((def as ForeignDef).kind === 'foreign') {
    registry.foreignDefs.set(def.name, def as ForeignDef);

    return;
  }
  registry.defs.set(def.name, def as ComponentDef);
}

export async function resolveDef(registry: ClientRegistry, name: string): Promise<ComponentDef> {
  const existing = registry.defs.get(name);

  if (existing) return existing;
  const loader = registry.loaders.get(name);

  if (!loader) throw new Error(`Janux: unknown island "${name}" (no loader registered)`);
  await loader();
  const loaded = registry.defs.get(name);

  if (!loaded) throw new Error(`Janux: island module for "${name}" did not register its def`);

  return loaded;
}
