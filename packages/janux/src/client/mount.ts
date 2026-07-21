import { effect as watch } from '../signals';
import { createInstance, type JanuxInstance } from '../runtime/instance';
import type { ComponentDef } from '../define/types';
import type { EventBus } from '../runtime/bus';
import { toDomNodes } from './dom';
import { morph } from './morph';
import { resolveDef, type ClientRegistry } from './registry';

export interface MountContext {
  registry: ClientRegistry;
  bus: EventBus;
  ctx: Record<string, unknown>;
  inflight: Set<Promise<unknown>>;
  onProposal: (proposal: unknown) => void;
  onAudit?: (entry: unknown) => void;
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

  return instance;
}

function startRenderLoop(instance: JanuxInstance, root: Element): () => void {
  return watch(() => {
    morph(root, toDomNodes(instance.def.view!(instance.bag)));
  });
}

/** Resumes one island: instance from its SSR snapshot, reactive render loop, no replay. */
export async function mountIsland(id: string, root: Element, mount: MountContext): Promise<JanuxInstance> {
  const { registry } = mount;
  const mounted = registry.mounted.get(id);

  if (mounted) return mounted;
  const [name, key = 'default'] = id.split('#');
  const def = await resolveDef(registry, name!);
  const snap = (registry.snapshots.get(`ui://${id}`) ?? registry.snapshots.get(`ui://${name}`)) as any;
  const instance = createInstance(def, {
    key,
    bus: mount.bus,
    ctx: mount.ctx,
    initial: snap?.state,
    initialSources: snap?.sources,
    stores: await ensureStores(def, mount),
    onProposal: mount.onProposal as any,
    onAudit: mount.onAudit as any,
  });

  registry.mounted.set(id, instance);
  const stopRender = startRenderLoop(instance, root);
  const dispose = instance.dispose.bind(instance);

  instance.dispose = async () => {
    stopRender();
    registry.mounted.delete(id);
    await dispose();
  };
  await instance.attach();

  return instance;
}
