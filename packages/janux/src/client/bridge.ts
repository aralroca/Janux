import { buildManifest, type Manifest } from '../manifest';
import { resolveGuard } from '../runtime/intents';
import type { JanuxInstance } from '../runtime/instance';
import type { Proposal } from '../runtime/intents';
import { ensureStore, mountIsland, type MountContext } from './mount';
import type { ClientRegistry } from './registry';

export interface JanuxBridge {
  read(uri: string): Promise<Record<string, unknown>>;
  call(tool: string, input?: unknown): Promise<unknown>;
  approve(id: string): Promise<unknown>;
  reject(id: string): boolean;
  settled(scope?: string): Promise<void>;
  subscribe(event: string, handler: (payload: unknown) => void): () => void;
  manifest(): Manifest;
}

function islandIdFor(component: string): string | undefined {
  const exact = document.querySelector(`janux-island[data-jx^="${component}#"]`);

  return exact?.getAttribute('data-jx') ?? undefined;
}

async function instanceFor(component: string, mount: MountContext): Promise<JanuxInstance> {
  const storeInstance = mount.registry.stores.get(component);

  if (storeInstance) return storeInstance;
  const registeredDef = mount.registry.defs.get(component);

  if (registeredDef?.kind === 'store') return ensureStore(registeredDef, mount);
  const id = islandIdFor(component);

  if (!id) throw new Error(`Janux: no mounted surface for "${component}"`);
  const root = document.querySelector(`janux-island[data-jx="${id}"]`)!;

  return mountIsland(id, root, mount);
}

function liveInstances(registry: ClientRegistry): JanuxInstance[] {
  return [...registry.mounted.values(), ...registry.stores.values()];
}

interface ToolEventExtras {
  guard?: string;
  approval?: boolean;
}

/** Resolves an intent's guard synchronously from the registered defs (no mount needed). */
function guardOf(mount: MountContext, component: string, intentName: string): string {
  const def =
    mount.registry.defs.get(component) ?? mount.registry.stores.get(component)?.def;
  const intentDef = def?.intents?.[intentName];

  return intentDef ? resolveGuard(intentDef, mount.ctx) : 'auto';
}

/** Emits `janux:tool-call` DOM events so apps can visualize agent activity (glow, chat lines). */
function emitToolEvent(
  tool: string,
  input: unknown,
  phase: 'start' | 'ok' | 'proposal' | 'error',
  extras: ToolEventExtras = {},
): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent('janux:tool-call', { detail: { tool, input, phase, ...extras } }),
  );
}

/** The gui-agent bridge: `ui.read / ui.call / ui.settled / ui.subscribe` over the mounted tree. */
export function createBridge(mount: MountContext, proposals: Map<string, Proposal>): JanuxBridge {
  const { registry } = mount;

  return {
    async read(uri) {
      const [, name = ''] = /^(?:ui|store):\/\/([^#]+)/.exec(uri) ?? [];
      const instance = await instanceFor(name, mount);

      return instance.resource();
    },

    async call(tool, input) {
      const [component = '', intentName = ''] = tool.split('.');
      const guard = guardOf(mount, component, intentName);

      emitToolEvent(tool, input, 'start', { guard });
      try {
        const instance = await instanceFor(component, mount);
        const invoke = instance.intents[intentName];

        if (!invoke) throw new Error(`Janux: unknown tool "${tool}"`);
        const result: any = await invoke(input, { origin: 'agent' });

        emitToolEvent(tool, input, result?.status === 'proposal' ? 'proposal' : 'ok', { guard });

        return result;
      } catch (error) {
        emitToolEvent(tool, input, 'error', { guard });
        throw error;
      }
    },

    async approve(id) {
      const proposal = proposals.get(id);

      if (!proposal) throw new Error(`Janux: unknown proposal "${id}"`);
      proposals.delete(id);
      // The approval IS the execution — this is when activity feedback fires.
      emitToolEvent(proposal.tool, proposal.input, 'start', { guard: 'confirm', approval: true });
      try {
        const result = await proposal.execute();

        emitToolEvent(proposal.tool, proposal.input, 'ok', { guard: 'confirm', approval: true });

        return result;
      } catch (error) {
        emitToolEvent(proposal.tool, proposal.input, 'error', { guard: 'confirm', approval: true });
        throw error;
      }
    },

    reject(id) {
      return proposals.delete(id);
    },

    async settled(scope) {
      do {
        await Promise.all([...mount.inflight]);
        const targets = scope
          ? [await instanceFor(scope.replace(/^(ui|store):\/\//, '').split('#')[0]!, mount)]
          : liveInstances(registry);

        await Promise.all(targets.map((instance) => instance.settled()));
      } while (mount.inflight.size > 0);
    },

    subscribe(event, handler) {
      return mount.bus.on(event, handler);
    },

    manifest() {
      const mountedEntries = [...registry.mounted.values()].map((instance) => ({
        def: instance.def,
        key: instance.uri.split('#')[1],
        instance,
      }));
      const storeEntries = [...registry.stores.values()].map((instance) => ({
        def: instance.def,
        instance,
      }));

      return buildManifest([...mountedEntries, ...storeEntries], mount.ctx);
    },
  };
}
