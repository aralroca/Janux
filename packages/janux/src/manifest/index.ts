import { toJsonSchema } from '../schema';
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
  return Object.entries(def.intents ?? {})
    .filter(([, intentDef]) => resolveGuard(intentDef, ctx) !== 'forbidden')
    .map(([name, intentDef]) => ({
      name: `${def.name}.${name}`,
      description: intentDef.description,
      guard: resolveGuard(intentDef, ctx),
      input: intentDef.input ? toJsonSchema(intentDef.input) : undefined,
      ready: instance && intentDef.ready ? safeReady(intentDef, instance) : true,
      server: intentDef.server || undefined,
      prefetch: intentDef.prefetch,
    }));
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
