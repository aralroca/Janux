import { buildManifest, type Manifest } from '../manifest';
import { resolveGuard } from '../runtime/intents';
import { flushRenders } from '../runtime/render-queue';
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
  glowTargetPending?: boolean;
}

/** The intent's definition, straight from the registry — no mount needed. */
function intentDefOf(mount: MountContext, component: string, intentName: string) {
  const def = mount.registry.defs.get(component) ?? mount.registry.stores.get(component)?.def;

  return def?.intents?.[intentName];
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
  const intentDef = intentDefOf(mount, component, intentName);

  // `unknown`, not `auto`. Anything watching `janux:tool-call` to audit agent
  // activity was being told a tool it could not even resolve was unguarded.
  return intentDef ? resolveGuard(intentDef, mount.ctx, 'agent') : 'unknown';
}

const API_PREFIX = 'api.';

/** POSTs JSON and unwraps the server's `{ ok, result }` envelope; a refusal becomes a thrown error. */
async function postJson(url: string, payload: unknown, asAgent: boolean): Promise<unknown> {
  const origin: Record<string, string> = asAgent ? { 'x-janux-origin': 'agent' } : {};
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...origin },
    body: JSON.stringify(payload ?? {}),
  });
  const body: any = await response.json().catch(() => ({}));

  if (!body.ok) throw new Error(String(body.error ?? `Janux: request to ${url} failed (${response.status})`));

  return body.result;
}

/**
 * An api() proposal lives on the server; the local mirror lets the page treat
 * it like any other: `janux:proposal` fires, and `execute` settles it through
 * `/_janux/approve` — a human act, so no agent origin header rides along.
 */
function mirrorApiProposal(tool: string, result: any, mount: MountContext, remote: Set<string>): void {
  remote.add(result.id);
  const proposal: Proposal = {
    id: result.id,
    tool,
    input: result.input,
    execute: () => postJson('/_janux/approve', { id: result.id }, false),
  };

  mount.onProposal(proposal);
}

/** The manifest announces api.* tools, so the bridge dispatches them too — over their HTTP endpoint. */
async function callApiTool(tool: string, input: unknown, mount: MountContext, remote: Set<string>): Promise<unknown> {
  // Encoded, not interpolated raw: tool names arrive over the public bridge,
  // and api names are `module.export` (dots only), so a name carrying slashes
  // or `..` would resolve out of /_janux/api/ — onto /_janux/llm, say.
  const result: any = await postJson(`/_janux/api/${encodeURIComponent(tool.slice(API_PREFIX.length))}`, input, true);

  if (result?.status === 'proposal') mirrorApiProposal(tool, result, mount, remote);

  return result;
}

/** The server copy must not outlive a local rejection; failures only mean an eventual eviction there. */
function rejectApiProposal(id: string): void {
  postJson('/_janux/reject', { id }, false).catch(() => {});
}

/** A mirrored api() proposal has no island to glow: the approval events carry the server tool's name. */
async function settleApiProposal(proposal: Proposal): Promise<unknown> {
  const extras = { guard: 'confirm', approval: true };

  emitToolEvent(proposal.tool, proposal.input, 'start', extras);
  try {
    const result = await proposal.execute();

    emitToolEvent(proposal.tool, proposal.input, 'ok', extras);

    return result;
  } catch (error) {
    emitToolEvent(proposal.tool, proposal.input, 'error', extras);
    throw error;
  }
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
  // api() proposals mirrored from the server: their settlement is an HTTP call.
  const remoteProposals = new Set<string>();
  // Proposals this page has already settled. Without it, a second approval of
  // a locally-settled id would look exactly like a token parked elsewhere —
  // and be forwarded to the server instead of refused where it is already known.
  const settledHere = new Set<string>();

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
      // Server api() tools: same call surface, dispatched over HTTP as the
      // agent surface. The guard lives server-side; a proposal result is the
      // `confirm` outcome, so the activity event can say so.
      if (tool.startsWith(API_PREFIX)) {
        emitToolEvent(tool, input, 'start', {});
        try {
          const result: any = await callApiTool(tool, input, mount, remoteProposals);
          const proposed = result?.status === 'proposal';

          emitToolEvent(tool, input, proposed ? 'proposal' : 'ok', proposed ? { guard: 'confirm' } : {});

          return result;
        } catch (error) {
          emitToolEvent(tool, input, 'error', {});
          throw error;
        }
      }
      const [component, intentName] = splitTool(tool);
      const guard = guardOf(mount, component, intentName);

      emitToolEvent(tool, input, 'start', {
        guard,
        // Announced up front so a feedback layer doesn't guess a target from the
        // view and get overridden by the declared one a moment later.
        glowTargetPending: intentDefOf(mount, component, intentName)?.glowTarget ? true : undefined,
      });
      try {
        const instance = await instanceFor(component, mount);
        const invoke = instance.intents[intentName];

        if (!invoke) throw new Error(`Janux: unknown tool "${tool}"`);
        const result: any = await invoke(input, { origin: 'agent' });
        const proposed = result?.status === 'proposal';

        emitToolEvent(tool, input, proposed ? 'proposal' : 'ok', {
          guard,
          // Nothing ran on a proposal — the target comes with the approval.
          glowTarget: proposed ? undefined : glowTargetOf(instance, intentName, input),
        });

        return result;
      } catch (error) {
        emitToolEvent(tool, input, 'error', { guard });
        throw error;
      }
    },

    async approve(id) {
      if (settledHere.has(id)) throw new Error(`Janux: unknown proposal "${id}"`);
      const proposal = proposals.get(id);

      // Never seen here: a call an agent parked from somewhere else entirely —
      // over MCP, or over A2A from another app — and settled *on this page*
      // because the human who decides is on this site, not wherever the request
      // came from. Only the server can tell a stale token from a foreign one
      // (it holds the vault and the key), so refusing locally would be the
      // client guessing at an answer it does not have.
      if (!proposal) return postJson('/_janux/approve', { id }, false);
      settledHere.add(id);
      proposals.delete(id);
      if (remoteProposals.delete(id)) return settleApiProposal(proposal);
      const [component, intentName] = splitTool(proposal.tool);
      const extras = { guard: 'confirm', approval: true };

      // The approval IS the execution — this is when activity feedback fires,
      // and when a declared glowTarget finally has an effect to point at.
      emitToolEvent(proposal.tool, proposal.input, 'start', {
        ...extras,
        glowTargetPending: intentDefOf(mount, component, intentName)?.glowTarget ? true : undefined,
      });
      try {
        const result = await proposal.execute();
        const instance = await instanceFor(component, mount);

        emitToolEvent(proposal.tool, proposal.input, 'ok', {
          ...extras,
          glowTarget: glowTargetOf(instance, intentName, proposal.input),
        });

        return result;
      } catch (error) {
        emitToolEvent(proposal.tool, proposal.input, 'error', { guard: 'confirm', approval: true });
        throw error;
      }
    },

    reject(id) {
      // Same two cases as `approve`: a mirrored api() proposal, or one this page
      // never saw. Both live on the server, and both are dropped there.
      if (remoteProposals.delete(id) || !(proposals.has(id) || settledHere.has(id))) rejectApiProposal(id);
      settledHere.add(id);
      // Dev only: a bare Map delete is invisible, and the devtools Proposals tab must follow it.
      if (import.meta.env?.DEV) document.dispatchEvent(new CustomEvent('janux:proposal-settled', { detail: id }));

      return proposals.delete(id);
    },

    async settled(scope) {
      do {
        flushRenders();
        // `allSettled`: waiting for quiet must not rethrow a failure the app
        // already received on `janux:error`. `inflight` holds the raw work
        // promises, so `all` would reject here only when the caller wins the
        // race against that entry being removed — a rejection you cannot
        // reproduce twice in a row.
        await Promise.allSettled([...mount.inflight]);
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
