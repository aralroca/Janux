import { describe, expect, it, mock } from 'bun:test';
import { component, intent, effect, source, store, onEvent } from '../define/factories';
import { int, list, schema, str } from '../schema';
import { createBus } from './bus';
import { createInstance } from './instance';
import type { Proposal } from './intents';

const noopView = () => null;

const cartDef = () =>
  component({
    name: 'cart',
    state: schema({ items: list({ id: str(), qty: int().min(1) }), coupon: str().nullable() }),
    derived: { count: (s: any) => s.items.reduce((acc: number, i: any) => acc + i.qty, 0) },
    emits: { 'cart.cleared': schema({}) },
    intents: {
      addItem: intent({
        input: schema({ id: str(), qty: int().min(1).default(1) }),
        run: ({ state, input }) => state.items.push(input),
      }),
      clear: intent({
        guard: 'confirm',
        run: ({ state, emit }) => {
          state.items = [];
          emit('cart.cleared', {});
        },
      }),
      hidden: intent({ guard: 'forbidden', run: () => 'secret' }),
    },
    view: noopView,
  });

describe('instance: state, derived, intents', () => {
  it('initializes from schema defaults and exposes uri', () => {
    const cart = createInstance(cartDef());

    expect(cart.uri).toBe('ui://cart');
    expect(cart.snapshot()).toEqual({ items: [], coupon: null });
  });

  it('batches an intent run: many state writes, one reactive flush', async () => {
    const { effect: sigEffect } = await import('../signals');
    const def = component({
      name: 'batchy',
      state: schema({ a: int().default(0), b: int().default(0), c: int().default(0) }),
      intents: {
        touchAll: intent({
          run: ({ state }) => {
            state.a += 1;
            state.b += 1;
            state.c += 1;
          },
        }),
      },
      view: noopView,
    });
    const instance = createInstance(def);
    let runs = 0;

    instance.runInScope(() =>
      sigEffect(() => {
        void instance.state.a;
        void instance.state.b;
        void instance.state.c;
        runs += 1;
      }),
    );
    expect(runs).toBe(1);
    await instance.intents.touchAll!();
    // The render loop is this same effect shape: three writes must cost ONE re-run.
    expect(runs).toBe(2);
  });

  it('derived reads inside a run body still see the mutation (no stale batch reads)', async () => {
    const seen: number[] = [];
    const def = component({
      name: 'fresh',
      state: schema({ items: list({ id: str() }) }),
      derived: { count: (s: any) => s.items.length },
      intents: {
        addTwo: intent({
          run: ({ state, derived }) => {
            state.items.push({ id: 'a' });
            seen.push(derived.count as number);
            state.items.push({ id: 'b' });
            seen.push(derived.count as number);
          },
        }),
      },
      view: noopView,
    });
    const instance = createInstance(def);

    await instance.intents.addTwo!();
    expect(seen).toEqual([1, 2]);
  });

  it('runs intents, mutates state and updates derived', async () => {
    const cart = createInstance(cartDef(), { key: 'main' });

    await cart.intents.addItem!({ id: 'a', qty: 2 });
    await cart.intents.addItem!({ id: 'b' });
    expect(cart.uri).toBe('ui://cart#main');
    expect(cart.snapshot().items).toHaveLength(2);
    expect(cart.derived.count).toBe(3);
  });

  it('.with() binds input without touching the original: same marker, own $input, still invocable', async () => {
    const cart = createInstance(cartDef(), { key: 'main' });
    const add = cart.intents.addItem!;
    const addA = add.with({ id: 'a' });
    const addB = add.with({ id: 'b', qty: 3 });

    // Two bindings from one map must not clobber each other or the base.
    expect(add.$input).toBeUndefined();
    expect(addA.$input).toEqual({ id: 'a' });
    expect(addB.$input).toEqual({ id: 'b', qty: 3 });
    expect(addA.$intent).toEqual(add.$intent);

    // A bound ref runs with its bound input; caller input merges on top.
    await addA();
    await addB({ qty: 1 });
    expect(cart.snapshot().items).toEqual([
      { id: 'a', qty: 1 },
      { id: 'b', qty: 1 },
    ]);

    // A primitive caller input is NOT spread into character-index garbage: it
    // goes through verbatim and fails validation exactly like an unbound call.
    expect(addA('draft' as any)).rejects.toThrow(/Invalid input/);
    expect(cart.snapshot().items).toHaveLength(2);
  });

  it('an approved proposal execution reaches the audit trail, not just the proposal', async () => {
    const entries: any[] = [];
    let proposal: Proposal | undefined;
    const cart = createInstance(cartDef(), { onAudit: (entry) => entries.push(entry), onProposal: (p) => (proposal = p) });

    await cart.intents.clear!({}, { origin: 'agent' });
    expect(entries).toEqual([expect.objectContaining({ tool: 'cart.clear', proposed: true })]);

    await proposal!.execute();
    expect(entries).toEqual([
      expect.objectContaining({ tool: 'cart.clear', proposed: true }),
      expect.objectContaining({ tool: 'cart.clear', origin: 'agent', guard: 'confirm', ok: true }),
    ]);
    expect(entries[1].proposed).toBeUndefined();
  });

  it('async intents may mutate state after awaits (regression)', async () => {
    const def = component({
      name: 'async-cart',
      state: schema({ items: list({ id: str(), qty: int() }), coupon: str().nullable() }),
      intents: {
        addThenCoupon: intent({
          run: async ({ state }: any) => {
            state.items.push({ id: 'a', qty: 1 });
            await Promise.resolve();
            state.coupon = 'SAVE10';
            await new Promise((resolve) => setTimeout(resolve, 5));
            state.items[0].qty = 2;
          },
        }),
      },
      view: noopView,
    });
    const cart = createInstance(def);

    await cart.intents.addThenCoupon!({});
    expect(cart.snapshot()).toEqual({ items: [{ id: 'a', qty: 2 }], coupon: 'SAVE10' });
  });

  it('validates intent input against its schema', async () => {
    const cart = createInstance(cartDef());

    expect(cart.intents.addItem!({ id: 'a', qty: 0 })).rejects.toThrow(/below min 1/);
  });

  it('records audit entries for every invocation', async () => {
    const entries: any[] = [];
    const cart = createInstance(cartDef(), { onAudit: (entry) => entries.push(entry) });

    await cart.intents.addItem!({ id: 'a' });
    expect(entries).toEqual([
      expect.objectContaining({ tool: 'cart.addItem', origin: 'human', guard: 'auto', ok: true }),
    ]);
  });
});

describe('instance: origin', () => {
  const doorDef = () =>
    component({
      name: 'door',
      state: schema({ openedBy: str().default('') }),
      intents: {
        open: intent({ run: ({ state, origin }: any) => (state.openedBy = origin) }),
        lock: intent({
          guard: ({ origin }: any) => (origin === 'agent' ? 'confirm' : 'auto'),
          run: ({ state, origin }: any) => (state.openedBy = `locked:${origin}`),
        }),
      },
      view: noopView,
    });

  it('run() sees who invoked it: human via the view, agent via the bridge channel', async () => {
    const door = createInstance(doorDef());

    await door.intents.open!({});
    expect(door.snapshot().openedBy).toBe('human');
    await door.intents.open!({}, { origin: 'agent' });
    expect(door.snapshot().openedBy).toBe('agent');
  });

  it('a dynamic guard can branch on origin: auto for humans, confirm for agents', async () => {
    let proposal: Proposal | undefined;
    const door = createInstance(doorDef(), { onProposal: (p) => (proposal = p) });

    // The same intent runs straight through for a human…
    await door.intents.lock!({});
    expect(door.snapshot().openedBy).toBe('locked:human');

    // …and only proposes for an agent, until a human approves.
    const result: any = await door.intents.lock!({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    expect(door.snapshot().openedBy).toBe('locked:human');
    await proposal!.execute();
    expect(door.snapshot().openedBy).toBe('locked:agent');
  });
});

describe('instance: guards', () => {
  it('agent + confirm returns a proposal; executing it applies the change', async () => {
    let proposal: Proposal | undefined;
    const cart = createInstance(cartDef(), { onProposal: (p) => (proposal = p) });

    const result: any = await cart.intents.clear!({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    expect(cart.snapshot().items).toEqual([]);
    await proposal!.execute();
    expect(cart.snapshot().items).toEqual([]);
  });

  it('human origin runs confirm intents directly', async () => {
    const cart = createInstance(cartDef());

    await cart.intents.addItem!({ id: 'a' });
    await cart.intents.clear!({});
    expect(cart.snapshot().items).toEqual([]);
  });

  it('agent cannot invoke forbidden intents', () => {
    const cart = createInstance(cartDef());

    expect(cart.intents.hidden!({}, { origin: 'agent' })).rejects.toThrow(/not available/);
  });
});

describe('instance: sources, effects, settled', () => {
  const catalogDef = (query: () => unknown) =>
    component({
      name: 'shop',
      state: schema({ picks: int() }),
      sources: { catalog: source({ query, refresh: onEvent('inventory.changed') }) },
      intents: {
        pick: intent({
          ready: ({ sources }) => !sources.catalog!.pending,
          run: ({ state }) => (state.picks += 1),
        }),
      },
      view: noopView,
    });

  it('loads sources async, gates ready intents, resolves settled()', async () => {
    const shop = createInstance(catalogDef(async () => ['p1']));

    await shop.attach();
    expect(shop.intents.pick!({})).rejects.toThrow(/not ready/);
    await shop.settled();
    expect(shop.sources.catalog.value).toEqual(['p1']);
    await shop.intents.pick!({});
    expect(shop.snapshot().picks).toBe(1);
    await shop.dispose();
  });

  it('re-queries sources when a refresh event fires', async () => {
    const bus = createBus();
    const query = mock(async () => 'data');
    const shop = createInstance(catalogDef(query), { bus });

    await shop.attach();
    await shop.settled();
    bus.emit('inventory.changed', {});
    await shop.settled();
    expect(query).toHaveBeenCalledTimes(2);
    await shop.dispose();
  });

  it('runs effects on attach, on change (debounced) and cleans up', async () => {
    const runs = mock(() => {});
    const cleanups = mock(() => {});
    const def = component({
      name: 'fx',
      state: schema({ n: int() }),
      effects: {
        track: effect({
          when: (s: any) => s.n,
          debounce: '10ms',
          run: () => {
            runs();

            return cleanups;
          },
        }),
      },
      intents: { bump: intent({ run: ({ state }) => (state.n += 1) }) },
      view: noopView,
    });
    const fx = createInstance(def);

    await fx.attach();
    expect(runs).toHaveBeenCalledTimes(1);
    await fx.intents.bump!({});
    await fx.settled();
    expect(runs).toHaveBeenCalledTimes(2);
    expect(cleanups).toHaveBeenCalledTimes(1);
    await fx.dispose();
    expect(cleanups).toHaveBeenCalledTimes(2);
  });
});

describe('instance: events and stores', () => {
  it('emits validated events across instances on a shared bus', async () => {
    const bus = createBus();
    const cart = createInstance(cartDef(), { bus });
    const listener = store({
      name: 'analytics',
      state: schema({ clears: int() }),
      on: { 'cart.cleared': ({ state }) => (state.clears += 1) },
    });
    const analytics = createInstance(listener, { bus });

    await cart.intents.clear!({});
    expect(analytics.snapshot().clears).toBe(1);
    expect(analytics.uri).toBe('store://analytics');
  });

  it('consumer intents reach store intents through use', async () => {
    const session = createInstance(
      store({
        name: 'session',
        state: schema({ locale: str().default('en') }),
        intents: {
          setLocale: intent({
            input: schema({ locale: str() }),
            run: ({ state, input }) => (state.locale = input.locale),
          }),
        },
      }),
    );
    const header = createInstance(
      component({
        name: 'header',
        intents: {
          toSpanish: intent({ run: ({ use }) => use.session!.intents.setLocale!({ locale: 'es' }) }),
        },
        view: noopView,
      }),
      { stores: { session } },
    );

    await header.intents.toSpanish!({});
    expect(session.snapshot().locale).toBe('es');
  });

  it('exposes an agent resource projection', async () => {
    const cart = createInstance(cartDef());

    await cart.intents.addItem!({ id: 'a', qty: 2 });
    const resource: any = cart.resource();

    expect(resource.uri).toBe('ui://cart');
    expect(resource.state.items).toEqual([{ id: 'a', qty: 2 }]);
    expect(resource.derived.count).toBe(2);
    expect(resource.sync).toBe('idle');
  });
});
