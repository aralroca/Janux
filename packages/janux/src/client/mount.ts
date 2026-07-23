import { effect as watch, untrack } from '../signals';
import { createInstance, type JanuxInstance } from '../runtime/instance';
import type { ComponentDef } from '../define/types';
import type { EventBus } from '../runtime/bus';
import { toDomNodes, type PendingIsland, type RenderPass } from './dom';
import { mountForeign } from './foreign';
import { morph } from './morph';
import { persistStore } from './persist';
import { registerDef, resolveDef, type ClientRegistry } from './registry';

export interface MountContext {
  registry: ClientRegistry;
  bus: EventBus;
  ctx: Record<string, unknown>;
  inflight: Set<Promise<unknown>>;
  onProposal: (proposal: unknown) => void;
  onAudit?: (entry: unknown) => void;
}

/** Client-discovered nested islands seed their def (already imported by the parent) and props. */
export interface MountSeed {
  def?: ComponentDef;
  initial?: Record<string, unknown>;
}

async function ensureStores(def: ComponentDef, mount: MountContext): Promise<Record<string, JanuxInstance>> {
  const entries = await Promise.all(
    Object.entries(def.use ?? {}).map(async ([alias, storeDef]) => {
      return [alias, await ensureStore(storeDef, mount)] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function ensureStore(storeDef: ComponentDef, mount: MountContext): Promise<JanuxInstance> {
  const { registry } = mount;
  const existing = registry.stores.get(storeDef.name);

  if (existing) return existing;
  const snap = registry.snapshots.get(`store://${storeDef.name}`) as any;
  const instance = createInstance(storeDef, {
    bus: mount.bus,
    ctx: mount.ctx,
    initial: snap?.state,
    initialSources: snap?.sources,
    onProposal: mount.onProposal as any,
    onAudit: mount.onAudit as any,
  });

  registry.stores.set(storeDef.name, instance);
  await instance.attach();
  // Local persistence rehydrates after attach and keeps writing back.
  if (storeDef.persist === 'local') {
    const stop = await persistStore(instance);
    const dispose = instance.dispose.bind(instance);

    instance.dispose = async () => {
      stop();
      await dispose();
    };
  }

  return instance;
}

function reportError(error: unknown): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
}

/** Mount pass-discovered islands that made it into the DOM and are not live yet. */
function mountNewChildren(pass: RenderPass, root: Element, mount: MountContext): void {
  const fresh = pass.islands.filter(({ id }) => !mount.registry.mounted.has(id));

  fresh.forEach(({ id, def, initial }: PendingIsland) => {
    const host = root.querySelector(`janux-island[data-jx="${id}"]`);

    if (host) mountIsland(id, host, mount, { def, initial }).catch(reportError);
  });
}

/** Mount new foreign roots; live ones just receive the fresh call-site props. */
function mountPassForeigns(pass: RenderPass, root: Element, mount: MountContext, parent: JanuxInstance): void {
  pass.foreigns.forEach(({ id, def, props }) => {
    const live = mount.registry.foreigns.get(id);

    if (live) {
      live.props.value = props;

      return;
    }
    const host = root.querySelector(`janux-foreign[data-jx="${id}"]`);

    if (host) mount.registry.foreigns.set(id, mountForeign(def, host, props, parent));
  });
}

/** Sweep foreign roots of this parent whose host left the DOM. */
function sweepForeigns(prefix: string, mount: MountContext): void {
  const gone = [...mount.registry.foreigns.entries()].filter(
    ([id]) =>
      keyOf(id).startsWith(prefix) &&
      !document.querySelector(`janux-foreign[data-jx="${id}"]`)?.isConnected,
  );

  gone.forEach(([id, handle]) => {
    handle.dispose();
    mount.registry.foreigns.delete(id);
  });
}

/** The key prefix every descendant of `name#key` carries (see SSR `nextKey`). */
function childPrefix(name: string, key: string): string {
  return `${name}.${key}.`;
}

function keyOf(id: string): string {
  return id.split('#')[1] ?? 'default';
}

/** Sweep children of this parent whose host left the DOM (same principle as navigation). */
function sweepChildren(name: string, key: string, mount: MountContext): void {
  const prefix = childPrefix(name, key);
  const gone = [...mount.registry.mounted.entries()].filter(
    ([id]) =>
      keyOf(id).startsWith(prefix) &&
      !document.querySelector(`janux-island[data-jx="${id}"]`)?.isConnected,
  );

  gone.forEach(([, instance]) => {
    instance.dispose().catch(reportError);
  });
  sweepForeigns(prefix, mount);
}

function startRenderLoop(instance: JanuxInstance, root: Element, key: string, mount: MountContext): () => void {
  // The render runs in the instance scope so any reactive resources a view or
  // derived creates (e.g. query subscriptions) dispose with the island.
  return instance.runInScope(() =>
    watch(() => {
      const pass: RenderPass = {
        parent: { name: instance.def.name, key },
        seq: new Map(),
        used: new Set(),
        islands: [],
        foreigns: [],
      };

      morph(root, toDomNodes(instance.def.view!(instance.bag), pass));
      untrack(() => {
        mountNewChildren(pass, root, mount);
        mountPassForeigns(pass, root, mount, instance);
        sweepChildren(instance.def.name, key, mount);
      });
    }),
  );
}

/** Disposing an island cascades to every mounted descendant (nested islands + foreign roots). */
async function disposeDescendants(name: string, key: string, mount: MountContext): Promise<void> {
  const prefix = childPrefix(name, key);
  const children = [...mount.registry.mounted.entries()].filter(([id]) => keyOf(id).startsWith(prefix));
  const foreigns = [...mount.registry.foreigns.entries()].filter(([id]) => keyOf(id).startsWith(prefix));

  foreigns.forEach(([id, handle]) => {
    handle.dispose();
    mount.registry.foreigns.delete(id);
  });
  await Promise.all(children.map(([, instance]) => instance.dispose()));
}

/**
 * Document-level foreign hydration: a foreign inside an island mounts its
 * enclosing island (the shell drives it — events need its intents); a
 * standalone foreign hydrates from its serialized call-site props.
 */
export async function mountDocumentForeigns(mount: MountContext): Promise<void> {
  const hosts = [...document.querySelectorAll('janux-foreign[data-jx]')];
  const parents = new Set<Element>();
  const standalone = hosts.filter((host) => {
    const island = host.closest('janux-island[data-jx]');

    if (island) parents.add(island);

    return !island;
  });

  await Promise.all(
    [...parents].map((island) => mountIsland(island.getAttribute('data-jx')!, island, mount)),
  );
  standalone
    .filter((host) => !mount.registry.foreigns.has(host.getAttribute('data-jx')!))
    .forEach((host) => {
      const id = host.getAttribute('data-jx')!;
      const def = mount.registry.foreignDefs.get(id.split('#')[0]!);
      const raw = host.getAttribute('data-jxf-props');

      if (def) mount.registry.foreigns.set(id, mountForeign(def, host, raw ? JSON.parse(raw) : {}));
    });
}

/** Dispose every foreign root whose host is no longer in the document (navigation sweep). */
export function sweepDisconnectedForeigns(mount: MountContext): void {
  sweepForeigns('', mount);
}

/** Resumes one island: instance from its SSR snapshot, reactive render loop, no replay. */
export function mountIsland(
  id: string,
  root: Element,
  mount: MountContext,
  seed?: MountSeed,
): Promise<JanuxInstance> {
  const { registry } = mount;
  const mounted = registry.mounted.get(id);

  if (mounted) return Promise.resolve(mounted);
  const inflight = registry.mounting.get(id);

  if (inflight) return inflight;
  const work = doMountIsland(id, root, mount, seed).finally(() => registry.mounting.delete(id));

  registry.mounting.set(id, work);

  return work;
}

async function doMountIsland(
  id: string,
  root: Element,
  mount: MountContext,
  seed?: MountSeed,
): Promise<JanuxInstance> {
  const { registry } = mount;
  const [name, key = 'default'] = id.split('#');

  if (seed?.def) registerDef(registry, seed.def);
  const def = await resolveDef(registry, name!);
  const snapKey = registry.snapshots.has(`ui://${id}`) ? `ui://${id}` : `ui://${name}`;
  const snap = registry.snapshots.get(snapKey) as any;
  const instance = createInstance(def, {
    key,
    bus: mount.bus,
    ctx: mount.ctx,
    initial: snap?.state ?? seed?.initial,
    initialSources: snap?.sources,
    stores: await ensureStores(def, mount),
    onProposal: mount.onProposal as any,
    onAudit: mount.onAudit as any,
  });

  registry.mounted.set(id, instance);
  const stopRender = startRenderLoop(instance, root, key!, mount);
  const dispose = instance.dispose.bind(instance);
  let disposed = false;

  instance.dispose = async () => {
    // Idempotent: navigation sweeps can reach a child both directly and via
    // its parent's cascade — lifecycle.detach must run exactly once.
    if (disposed) return;
    disposed = true;
    stopRender();
    registry.mounted.delete(id);
    await disposeDescendants(name!, key!, mount);
    await dispose();
  };
  try {
    await instance.attach();
  } catch (error) {
    stopRender();
    registry.mounted.delete(id);
    throw error;
  }
  // A snapshot resumes an island exactly once — consumed only after the mount
  // actually succeeded, so a failed mount can retry with the SSR state intact.
  registry.snapshots.delete(snapKey);
  // The host may have left the document while this mount was in flight (SPA
  // navigation): tear down immediately instead of leaking live sources.
  if (!root.isConnected) {
    await instance.dispose();
  }

  return instance;
}
