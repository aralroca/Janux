import { buildDefault, toJsonSchema, validate } from '../schema';
import { computed, createRoot, getOwner, runWithOwner, untrack, type Owner, type ReadonlySig } from '../signals';
import { createReactiveState } from '../state/reactive-state';
import { createGate, withGate } from '../state/mutation-gate';
import type { ComponentDef, Ctx, Origin, RunBag, StoreHandle } from '../define/types';
import { createBus, type EventBus } from './bus';
import { createPendingTracker } from './settled';
import { createSources } from './sources';
import { startEffects } from './effects';
import { invokeIntent, type AuditEntry, type Proposal } from './intents';

export interface InstanceOptions {
  key?: string;
  initial?: Record<string, unknown>;
  initialSources?: Record<string, { value: unknown }>;
  ctx?: Ctx;
  bus?: EventBus;
  stores?: Record<string, JanuxInstance>;
  onAudit?: (entry: AuditEntry) => void;
  onProposal?: (proposal: Proposal) => void;
}

export interface JanuxInstance {
  def: ComponentDef;
  uri: string;
  state: any;
  derived: Record<string, unknown>;
  sources: Record<string, any>;
  intents: Record<string, (input?: unknown, opts?: { origin?: Origin }) => Promise<unknown>>;
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

/**
 * A snapshot is untrusted input.
 *
 * It travels inside the served HTML and is read back on resume, so anything that
 * can influence that markup — a poisoned cache, a reflected value, a user editing
 * the DOM before boot — used to become state directly. Unvalidated, an injected
 * `isAdmin: true` was indistinguishable from declared state, wrong types survived,
 * and an array could *replace* the state object. The same state is what a `ui://`
 * resource shows the agent, so a poisoned snapshot lied to both faces at once.
 *
 * `validate` strips undeclared keys and fills defaults; a snapshot that cannot be
 * validated at all is discarded in favour of defaults rather than half-trusted.
 */
function resolveInitial(def: ComponentDef, initial?: Record<string, unknown>): Record<string, unknown> {
  if (!def.state) return initial ?? {};
  const defaults = () => buildDefault(def.state!) as Record<string, unknown>;

  if (initial === undefined) return defaults();
  const result = validate(def.state, initial);

  if (result.ok) return result.value as Record<string, unknown>;
  console.warn(`Janux: discarded an invalid state snapshot for "${def.name}" — ${result.errors[0]?.message}`);

  return defaults();
}

/** Creates a live component/store instance. Call `attach()` to start sources, effects and lifecycle. */
export function createInstance(def: ComponentDef, options: InstanceOptions = {}): JanuxInstance {
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
  const scheme = def.kind === 'store' ? 'store' : 'ui';
  const uri = `${scheme}://${def.name}${options.key ? `#${options.key}` : ''}`;

  const intents: JanuxInstance['intents'] = {};
  const bag: RunBag = {
    state: state.proxy,
    derived,
    sources: sourcesRuntime.readers,
    intents,
    use,
    emit,
    ctx,
  };
  const hooks = {
    gate,
    onAudit: options.onAudit,
    onProposal: options.onProposal,
    trackPending: tracker.track,
  };

  Object.entries(def.intents ?? {}).forEach(([name, intentDef]) => {
    const invoke = (input?: unknown, opts?: { origin?: Origin }) =>
      invokeIntent(def.name, name, intentDef, bag, input, opts?.origin ?? 'human', hooks);

    (invoke as any).$intent = { component: def.name, key: options.key, name };
    intents[name] = invoke;
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
    patch(values: Record<string, unknown>) {
      withGate(gate, () => {
        Object.entries(values).forEach(([field, value]) => {
          if (field in state.proxy) (state.proxy as any)[field] = value;
        });
      });
    },
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
      return {
        uri,
        description: def.description,
        schema: def.state ? toJsonSchema(def.state) : undefined,
        state: state.snapshot(),
        derived: evaluateDerived(derived),
        sync: tracker.count > 0 ? 'pending' : 'idle',
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
