import { toJsonSchema, validate } from '../schema';
import { computed, createRoot, getOwner, runWithOwner, untrack, type Owner, type ReadonlySig } from '../signals';
import { createReactiveState } from '../state/reactive-state';
import { createGate, withGate } from '../state/mutation-gate';
import type { ComponentDef, Ctx, IntentMeta, IntentRef, Origin, RunBag, StoreHandle } from '../define/types';
import { createBus, type EventBus } from './bus';
import { createPendingTracker } from './settled';
import { createSources } from './sources';
import { startEffects } from './effects';
import { invokeIntent, type AuditEntry, type Caller, type IntentHooks, type Proposal } from './intents';
import { traceDef } from '../dev/trace';
import { applyPatch, resolveInitial } from './state-intake';
import { untrustedFields } from '../taint/fields';

export interface InstanceOptions {
  key?: string;
  initial?: Record<string, unknown>;
  initialSources?: Record<string, { value: unknown }>;
  ctx?: Ctx;
  bus?: EventBus;
  stores?: Record<string, JanuxInstance>;
  onAudit?: (entry: AuditEntry) => void;
  onProposal?: (proposal: Proposal) => void;
  /** `false` where nothing shows the proposal's before/after — see `IntentHooks`. */
  proposalDiff?: boolean;
}

/** An instance-level intent ref: the public `IntentRef` plus the internal origin channel. */
export interface IntentInvoke extends IntentRef {
  (input?: unknown, opts?: Partial<Caller>): Promise<unknown>;
  with(input: Record<string, unknown>): IntentInvoke;
}

/**
 * Stamps `invoke` as a bound intent ref. `.with()` returns a NEW ref sharing
 * the same runtime invoke — so sibling bindings in a list never clobber each
 * other — and a bound ref called directly runs with its bound input underneath
 * the caller's.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bindIntent(
  invoke: (input?: unknown, opts?: Partial<Caller>) => Promise<unknown>,
  meta: IntentMeta,
  bound?: Record<string, unknown>,
): IntentInvoke {
  // Merging only makes sense object-into-object: a primitive caller input goes
  // through verbatim (and fails schema validation exactly like an unbound call
  // would) instead of being spread into character-index garbage.
  const merged = (input?: unknown) => {
    if (!bound) return input;
    if (input === undefined) return bound;

    return isPlainObject(input) ? { ...bound, ...input } : input;
  };
  const call = (input?: unknown, opts?: Partial<Caller>) => invoke(merged(input), opts);

  return Object.assign(call, {
    $intent: meta,
    ...(bound === undefined ? {} : { $input: bound }),
    with: (extra: Record<string, unknown>) => bindIntent(invoke, meta, { ...bound, ...extra }),
  });
}

export interface JanuxInstance {
  def: ComponentDef;
  uri: string;
  state: any;
  derived: Record<string, unknown>;
  sources: Record<string, any>;
  intents: Record<string, IntentInvoke>;
  emit: (event: string, payload: unknown) => void;
  bag: RunBag;
  snapshot(): Record<string, unknown>;
  /** Writes a state patch through the mutation gate (rehydration, external restore). */
  patch(values: Record<string, unknown>): void;
  sourcesSnapshot(): Record<string, { value: unknown }>;
  resource(): Record<string, unknown>;
  settled(): Promise<void>;
  attach(): Promise<void>;
  dispose(): Promise<void>;
  handle(): StoreHandle;
  /** Runs `fn` inside the instance's disposal scope (effects created there die with it). */
  runInScope<T>(fn: () => T): T;
}

function derivedReaders(def: ComponentDef, proxy: any) {
  const computeds = new Map<string, ReadonlySig<unknown>>(
    Object.entries(def.derived ?? {}).map(([name, fn]) => [name, computed(() => fn(proxy))]),
  );
  const readers: Record<string, unknown> = {};

  computeds.forEach((sig, name) => {
    Object.defineProperty(readers, name, { get: () => sig.value, enumerable: true });
  });

  return { readers, dispose: () => computeds.forEach((sig) => sig.dispose()) };
}

function storeHandles(stores: Record<string, JanuxInstance>): Record<string, StoreHandle> {
  return Object.fromEntries(
    Object.entries(stores).map(([alias, instance]) => [alias, instance.handle()]),
  );
}

function makeEmit(def: ComponentDef, bus: EventBus) {
  return (event: string, payload: unknown): void => {
    const schema = def.emits?.[event];

    if (!schema) throw new Error(`Janux: "${def.name}" does not declare event "${event}"`);
    const result = validate(schema, payload ?? {});

    if (!result.ok) throw new Error(`Janux: invalid payload for "${event}"`);
    bus.emit(event, result.value);
  };
}

function evaluateDerived(readers: Record<string, unknown>): Record<string, unknown> {
  return untrack(() => JSON.parse(JSON.stringify({ ...readers })));
}

/** Creates a live component/store instance. Call `attach()` to start sources, effects and lifecycle. */
export function createInstance(def: ComponentDef, options: InstanceOptions = {}): JanuxInstance {
  const scheme = def.kind === 'store' ? 'store' : 'ui';
  const uri = `${scheme}://${def.name}${options.key ? `#${options.key}` : ''}`;

  // Dev only, eliminated from production builds: effects and sources publish
  // their failures with the chain that explains them (see dev/error-channel.ts).
  if (import.meta.env?.DEV) def = traceDef(def, uri);

  const ctx = options.ctx ?? {};
  const bus = options.bus ?? createBus();
  const tracker = createPendingTracker();
  const initial = resolveInitial(def, options.initial);
  const gate = createGate();
  const state = createReactiveState(initial as Record<string, unknown>, gate);
  const sourcesRuntime = createSources(def.sources, ctx, bus, tracker, options.initialSources);
  const { readers: derived, dispose: disposeDerived } = derivedReaders(def, state.proxy);
  const emit = makeEmit(def, bus);
  const use = storeHandles(options.stores ?? {});

  const intents: JanuxInstance['intents'] = {};
  const bag: RunBag = {
    state: state.proxy,
    derived,
    sources: sourcesRuntime.readers,
    intents,
    use,
    emit,
    ctx,
    // Non-intent code (view, effects, lifecycle) runs on behalf of the
    // session's user; `invokeIntent` overlays the caller's actual origin.
    origin: 'human',
  };
  const hooks: IntentHooks = {
    gate,
    onAudit: options.onAudit,
    onProposal: options.onProposal,
    proposalDiff: options.proposalDiff,
    trackPending: tracker.track,
  };

  if (import.meta.env?.DEV) hooks.devUri = uri;

  Object.entries(def.intents ?? {}).forEach(([name, intentDef]) => {
    const invoke = (input?: unknown, opts?: Partial<Caller>) =>
      invokeIntent(def.name, name, intentDef, bag, input, { ...opts, origin: opts?.origin ?? 'human' }, hooks);

    intents[name] = bindIntent(invoke, { component: def.name, key: options.key, name });
  });

  let stopEffects: (() => void) | undefined;
  const busUnsubs = Object.entries(def.on ?? {}).map(([event, handler]) =>
    bus.on(event, (payload) => withGate(gate, () => handler({ ...bag, event: payload }))),
  );

  // Disposal scope: effects/queries created during attach, render or intents
  // register here and are torn down when the instance disposes.
  let scope: Owner;
  let disposeScope: () => void = () => {};

  createRoot((dispose) => {
    scope = getOwner()!;
    disposeScope = dispose;
  });

  return {
    def,
    uri,
    state: state.proxy,
    derived,
    sources: sourcesRuntime.readers,
    intents,
    emit,
    bag,
    snapshot: () => state.snapshot(),
    patch: (values: Record<string, unknown>) => applyPatch(def, state, gate, values),
    sourcesSnapshot() {
      return untrack(() =>
        Object.fromEntries(
          Object.entries(sourcesRuntime.readers)
            .filter(([, reader]) => !reader.pending && reader.error === null)
            .map(([name, reader]) => [name, { value: reader.value }]),
        ),
      );
    },
    settled: () => tracker.settled(),
    resource() {
      const untrusted = untrustedFields(def.state);

      return {
        uri,
        description: def.description,
        schema: def.state ? toJsonSchema(def.state) : undefined,
        state: state.snapshot(),
        derived: evaluateDerived(derived),
        sync: tracker.count > 0 ? 'pending' : 'idle',
        ...(untrusted.length > 0 && { untrusted }),
      };
    },
    async attach() {
      sourcesRuntime.start();
      stopEffects = startEffects(def.effects, bag, tracker, gate);
      await runWithOwner(scope, () => withGate(gate, () => def.lifecycle?.attach?.(bag)));
    },
    async dispose() {
      stopEffects?.();
      sourcesRuntime.dispose();
      disposeDerived();
      disposeScope();
      busUnsubs.forEach((unsub) => unsub());
      await withGate(gate, () => def.lifecycle?.detach?.(bag));
    },
    handle(): StoreHandle {
      return { state: state.proxy, derived, intents: bindHumanIntents(intents) };
    },
    runInScope<T>(fn: () => T): T {
      return runWithOwner(scope, fn);
    },
  };
}

function bindHumanIntents(intents: JanuxInstance['intents']) {
  return Object.fromEntries(
    Object.entries(intents).map(([name, invoke]) => [name, (input?: unknown) => invoke(input)]),
  );
}
