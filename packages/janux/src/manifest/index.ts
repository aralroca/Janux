import { toJsonSchema, type JxType } from '../schema';
import type { ComponentDef, Ctx } from '../define/types';
import { resolveGuard } from '../runtime/intents';
import type { JanuxInstance } from '../runtime/instance';

export interface ManifestTool {
  name: string;
  description?: string;
  guard: string;
  input?: Record<string, unknown>;
  ready?: boolean;
  server?: boolean;
  prefetch?: string;
}

export interface ManifestResource {
  uri: string;
  description?: string;
  schema?: Record<string, unknown>;
  readers?: string[];
  opaque?: boolean;
}

export interface Manifest {
  janux: string;
  resources: ManifestResource[];
  tools: ManifestTool[];
  events: string[];
}

function uriFor(def: ComponentDef, key?: string): string {
  const scheme = def.kind === 'store' ? 'store' : 'ui';

  return `${scheme}://${def.name}${key && key !== 'default' ? `#${key}` : ''}`;
}

function toolsFor(def: ComponentDef, ctx: Ctx, instance?: JanuxInstance): ManifestTool[] {
  // The guard is resolved once and reused. Resolving it twice let a guard function
  // that answers differently on each call pass the filter and then be advertised
  // as `forbidden` — a tool listed for the agent that the filter meant to remove.
  return Object.entries(def.intents ?? {})
    .map(([name, intentDef]) => ({ name, intentDef, guard: resolveGuard(intentDef, ctx, 'agent') }))
    .filter(({ guard }) => guard !== 'forbidden')
    .map(({ name, intentDef, guard }) => ({
      name: `${def.name}.${name}`,
      description: intentDef.description,
      guard,
      input: inputFor(intentDef, instance),
      ready: instance && intentDef.ready ? safeReady(intentDef, instance) : true,
      server: intentDef.server || undefined,
      prefetch: intentDef.prefetch,
    }));
}

/** A field's live `options()`. A resolver that cannot answer advertises nothing, like `ready`. */
function optionsFor(field: JxType | undefined, instance: JanuxInstance): readonly unknown[] {
  try {
    return field?.optionsOf?.(instance.bag) ?? [];
  } catch {
    return [];
  }
}

/** Overlays each property with the values its field currently accepts. */
function withLiveOptions(shape: Record<string, JxType>, base: Record<string, unknown>, instance: JanuxInstance) {
  const properties = Object.entries((base.properties ?? {}) as Record<string, unknown>).map(([key, property]) => {
    const values = optionsFor(shape[key], instance);

    return [key, values.length ? { ...(property as object), enum: [...values] } : property];
  });

  return { ...base, properties: Object.fromEntries(properties) };
}

/** The tool's JSON Schema — static from the declaration, live wherever a field declares `options()`. */
function inputFor(
  intentDef: NonNullable<ComponentDef['intents']>[string],
  instance?: JanuxInstance,
): Record<string, unknown> | undefined {
  if (!intentDef.input) return undefined;
  const base = toJsonSchema(intentDef.input);

  return instance && intentDef.input.shape ? withLiveOptions(intentDef.input.shape, base, instance) : base;
}

function safeReady(intentDef: NonNullable<ComponentDef['intents']>[string], instance: JanuxInstance): boolean {
  try {
    return intentDef.ready!(instance.bag) === true;
  } catch {
    return false;
  }
}

function resourceFor(def: ComponentDef, key?: string, readers?: string[]): ManifestResource[] {
  if (!def.state) return [];

  return [
    {
      uri: uriFor(def, key),
      description: def.description,
      schema: toJsonSchema(def.state),
      readers,
    },
  ];
}

export interface ManifestEntry {
  def: ComponentDef;
  key?: string;
  instance?: JanuxInstance;
}

/**
 * Builds the agent-facing manifest from mounted components and stores.
 * The mounted component tree IS the MCP tree (RFC §5.1).
 */
export function buildManifest(entries: ManifestEntry[], ctx: Ctx = {}): Manifest {
  const readersByStore = storeReaders(entries);
  const resources = entries.flatMap(({ def, key }) =>
    resourceFor(def, key, def.kind === 'store' ? readersByStore.get(def.name) : undefined),
  );
  const tools = entries.flatMap(({ def, instance }) => toolsFor(def, ctx, instance));
  const events = [...new Set(entries.flatMap(({ def }) => Object.keys(def.emits ?? {})))];

  return { janux: '0.1', resources, tools, events };
}

function storeReaders(entries: ManifestEntry[]): Map<string, string[]> {
  const readers = new Map<string, string[]>();

  entries
    .filter(({ def }) => def.kind === 'component')
    .forEach(({ def, key }) => {
      Object.values(def.use ?? {}).forEach((storeDef) => {
        const list = readers.get(storeDef.name) ?? [];

        readers.set(storeDef.name, [...list, uriFor(def, key)]);
      });
    });

  return readers;
}
