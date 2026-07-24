import { describe, expect, it } from 'bun:test';
import { component, createBus, createInstance, int, intent, jsx, money, schema, str } from 'janux';

/**
 * recipes/cross-island-events.md, asserted: the payload is schema-validated, an
 * undeclared event throws at emit time, a listener receives it as `event`, and
 * one bus per page is what makes two islands meet.
 */

const Cart = component({
  name: 'cart',
  state: schema({ total: int().default(0) }),
  emits: { 'cart.checkedOut': schema({ orderId: str(), total: money() }) },
  intents: {
    checkout: intent({
      description: 'Check out',
      run: ({ emit }: any) => emit('cart.checkedOut', { orderId: 'o1', total: 2500 }),
    }),
    bogus: intent({ description: 'Emit an undeclared event', run: ({ emit }: any) => emit('nope', {}) }),
    invalid: intent({
      description: 'Emit a bad payload',
      run: ({ emit }: any) => emit('cart.checkedOut', { orderId: 'o1' }),
    }),
  },
  view: () => jsx('p', {}),
});

const Toasts = component({
  name: 'toasts',
  state: schema({ message: str().default('') }),
  on: {
    'cart.checkedOut': ({ state, event }: any) => {
      state.message = `Order ${event.orderId} confirmed ✔`;
    },
  },
  intents: {},
  view: ({ state }: any) => jsx('p', { children: state.message }),
});

async function pair() {
  const bus = createBus();
  const cart = createInstance(Cart, { bus });
  const toasts = createInstance(Toasts, { bus });

  await cart.attach();
  await toasts.attach();

  return { cart, toasts };
}

describe('recipes/cross-island-events.md', () => {
  it('an emit reaches another island through the page bus, as `event`', async () => {
    const { cart, toasts } = await pair();

    await cart.intents.checkout();

    expect(toasts.snapshot().message).toBe('Order o1 confirmed ✔');
  });

  it('an undeclared event throws at emit time', async () => {
    const { cart } = await pair();

    await expect(cart.intents.bogus()).rejects.toThrow(/does not declare event "nope"/);
  });

  it('a payload that violates the declared schema throws too', async () => {
    const { cart } = await pair();

    await expect(cart.intents.invalid()).rejects.toThrow(/invalid payload/);
  });

  it('islands on different buses never hear each other', async () => {
    const cart = createInstance(Cart, { bus: createBus() });
    const toasts = createInstance(Toasts, { bus: createBus() });

    await cart.attach();
    await toasts.attach();
    await cart.intents.checkout();

    expect(toasts.snapshot().message).toBe('');
  });

  it('the bridge-level subscribe sees the same event a listener island does', async () => {
    const bus = createBus();
    const seen: unknown[] = [];
    const cart = createInstance(Cart, { bus });

    await cart.attach();
    bus.on('cart.checkedOut', (payload) => seen.push(payload));
    await cart.intents.checkout();

    expect(seen).toEqual([{ orderId: 'o1', total: 2500 }]);
  });
});
