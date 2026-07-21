import { buildDefault, toJsonSchema, validate } from '../schema';
import { computed, untrack, type ReadonlySig } from '../signals';
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
  sourcesSnapshot(): Record<string, { value: unknown }>;
  resource(): Record<string, unknown>;
  settled(): Promise<void>;
  attach(): Promise<void>;
  dispose(): Promise<void>;
  handle(): StoreHandle;
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
  const ctx = options.ctx ?? {};
  const bus = options.bus ?? createBus();
  const tracker = createPendingTracker();
  const initial = options.initial ?? (def.state ? (buildDefault(def.state) as any) : {});
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
      await withGate(gate, () => def.lifecycle?.attach?.(bag));
    },
    async dispose() {
      stopEffects?.();
      sourcesRuntime.dispose();
      disposeDerived();
      busUnsubs.forEach((unsub) => unsub());
      await withGate(gate, () => def.lifecycle?.detach?.(bag));
    },
    handle(): StoreHandle {
      return { state: state.proxy, derived, intents: bindHumanIntents(intents) };
    },
  };
}

function bindHumanIntents(intents: JanuxInstance['intents']) {
  return Object.fromEntries(
    Object.entries(intents).map(([name, invoke]) => [name, (input?: unknown) => invoke(input)]),
  );
}
