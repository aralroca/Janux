import { buildManifest, type Manifest } from '../manifest';
import { resolveGuard } from '../runtime/intents';
import type { JanuxInstance } from '../runtime/instance';
import type { Proposal } from '../runtime/intents';
import { ensureStore, mountIsland, type MountContext } from './mount';
import type { ClientRegistry } from './registry';
import { CLIENT_TOOL_NAMES, executeClientTool } from './client-tools';

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
  glowTarget?: string;
}

/**
 * An intent's declared `glowTarget`, resolved with the post-run bag. A resolver
 * that throws must not turn a mutation that already happened into a failed
 * call, so it degrades to no hint and reports itself.
 */
function glowTargetOf(instance: JanuxInstance, intentName: string, input: unknown): string | undefined {
  const resolve = instance.def.intents?.[intentName]?.glowTarget;

  if (!resolve) return undefined;
  try {
    return resolve({ ...instance.bag, input }) ?? undefined;
  } catch (error) {
    document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));

    return undefined;
  }
}

/** Resolves an intent's guard synchronously from the registered defs (no mount needed). */
function guardOf(mount: MountContext, component: string, intentName: string): string {
  const def =
    mount.registry.defs.get(component) ?? mount.registry.stores.get(component)?.def;
  const intentDef = def?.intents?.[intentName];

  // `unknown`, not `auto`. Anything watching `janux:tool-call` to audit agent
  // activity was being told a tool it could not even resolve was unguarded.
  return intentDef ? resolveGuard(intentDef, mount.ctx) : 'unknown';
}

/**
 * A tool is addressed as exactly `component.intent`.
 *
 * Destructuring the first two parts of `tool.split('.')` and carrying on meant any
 * suffix was silently ignored: `cart.pay.anything.at.all` ran `cart.pay`. So names
 * that appear nowhere in the manifest were executable, which breaks the promise
 * that the mounted tree *is* the agent surface — and it arrives over the wire, so
 * validating the declaration side is not enough on its own.
 */
function splitTool(tool: string): [string, string] {
  const parts = tool.split('.');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Janux: malformed tool name "${tool}" — expected "component.intent"`);
  }

  return [parts[0], parts[1]];
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
      // Built-in client tools (navigation, view context, DOM fallback) run
      // before island resolution — same activity events, so the glow fires.
      if (CLIENT_TOOL_NAMES.has(tool)) {
        emitToolEvent(tool, input, 'start', { guard: 'auto' });
        try {
          const result = await executeClientTool(tool, input, () => this.settled());

          emitToolEvent(tool, input, 'ok', { guard: 'auto' });

          return result;
        } catch (error) {
          emitToolEvent(tool, input, 'error', { guard: 'auto' });
          throw error;
        }
      }
      const [component, intentName] = splitTool(tool);
      const guard = guardOf(mount, component, intentName);

      emitToolEvent(tool, input, 'start', { guard });
      try {
        const instance = await instanceFor(component, mount);
        const invoke = instance.intents[intentName];

        if (!invoke) throw new Error(`Janux: unknown tool "${tool}"`);
        const result: any = await invoke(input, { origin: 'agent' });
        const proposed = result?.status === 'proposal';

        emitToolEvent(tool, input, proposed ? 'proposal' : 'ok', {
          guard,
          // Nothing ran on a proposal, so there is no effect to point at yet.
          glowTarget: proposed ? undefined : glowTargetOf(instance, intentName, input),
        });

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
