import { childPrefix, keyOf } from '../client/mount';
import type { ClientRegistry } from '../client/registry';
import type { JanuxInstance } from '../runtime/instance';
import type { StateDiff } from '../runtime/dry-run';

/**
 * Pure readers behind the devtools panel. Everything here derives from state
 * the runtime already exposes — `registry.mounted`/`stores`, `resource()`,
 * `SourceReader` flags, `StateDiff` — with point-in-time reads only: no
 * subscriptions, so the panel cannot change what it observes.
 */

export interface IslandNode {
  id: string;
  name: string;
  key: string;
  uri: string;
  sync: string;
  children: IslandNode[];
}

export interface DevtoolsTree {
  islands: IslandNode[];
  stores: IslandNode[];
}

export interface DiffRow {
  key: string;
  before: string | undefined;
  after: string | undefined;
  changed: boolean;
}

export interface SourceRow {
  name: string;
  pending: boolean;
  refreshing: boolean;
  error: string;
}

/** Same namespace SSR `nextKey` writes and mount.ts sweeps — mount owns the definition. */
const childPrefixOf = (id: string): string => childPrefix(nameOf(id), keyOf(id));

const nameOf = (id: string): string => id.split('#')[0] ?? id;

function nodeOf(id: string, item: JanuxInstance | undefined): IslandNode {
  return {
    id,
    name: nameOf(id),
    key: keyOf(id),
    uri: item?.uri ?? `ui://${id}`,
    sync: item ? String((item.resource() as { sync?: unknown }).sync ?? 'idle') : 'not resumed',
    children: [],
  };
}

/** The closest ancestor: the id whose child namespace is the longest prefix of this key. */
function parentIdOf(id: string, ids: string[]): string | undefined {
  const candidates = ids.filter((other) => other !== id && keyOf(id).startsWith(childPrefixOf(other)));

  return candidates.reduce<string | undefined>(
    (best, candidate) => (best && childPrefixOf(best).length >= childPrefixOf(candidate).length ? best : candidate),
    undefined,
  );
}

/**
 * The island tree as ownership: nested islands under their parent, stores flat
 * beside the roots. `domIds` adds the islands the document names but nobody
 * has resumed yet — lazy by design, still part of the page's surface.
 */
export function ownershipTree(registry: ClientRegistry, domIds: string[] = []): DevtoolsTree {
  const ids = [...new Set([...registry.mounted.keys(), ...domIds])];
  const nodes = new Map(ids.map((id) => [id, nodeOf(id, registry.mounted.get(id))]));
  const parents = new Map(ids.map((id) => [id, parentIdOf(id, ids)]));

  ids.forEach((id) => {
    const parent = parents.get(id);

    if (parent) nodes.get(parent)!.children.push(nodes.get(id)!);
  });

  return {
    islands: ids.filter((id) => !parents.get(id)).map((id) => nodes.get(id)!),
    stores: [...registry.stores.entries()].map(([name, item]) => ({ ...nodeOf(`${name}#`, item), id: name, key: '' })),
  };
}

/** `proposed` first: a parked confirm-guard call logs `ok: true` without having run. */
export function statusOf(entry: { ok: boolean; proposed?: boolean }): 'proposed' | 'ok' | 'error' {
  if (entry.proposed) return 'proposed';

  return entry.ok ? 'ok' : 'error';
}

const asJson = (bag: Record<string, unknown>, key: string): string | undefined =>
  key in bag ? JSON.stringify(bag[key]) : undefined;

/** The shadow-run before/after, joined by key so a human reads an outcome, not two blobs. */
export function diffRows(diff: StateDiff): DiffRow[] {
  const keys = [...new Set([...Object.keys(diff.before), ...Object.keys(diff.after)])].sort();

  return keys.map((key) => {
    const before = asJson(diff.before, key);
    const after = asJson(diff.after, key);

    return { key, before, after, changed: before !== after };
  });
}

/** Status flags only — reading `value` could resolve SWR expiry, and the panel must observe, not touch. */
export function sourceRows(item: JanuxInstance): SourceRow[] {
  return Object.entries(item.sources).map(([name, reader]) => ({
    name,
    pending: !!reader.pending,
    refreshing: !!reader.refreshing,
    error: reader.error == null ? '' : String(reader.error),
  }));
}
