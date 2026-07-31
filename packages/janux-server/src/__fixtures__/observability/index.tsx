import { component, intent, jsx, obj, str } from 'janux';

export const cart = component({
  name: 'cart',
  description: 'The shopping cart',
  state: obj({ last: str() }),
  intents: {
    checkout: intent({
      description: 'Place the order',
      guard: 'confirm',
      input: obj({ sku: str() }),
      run: ({ state, input }) => {
        state.last = (input as { sku: string }).sku;
      },
    }),
  },
  view: ({ state }: any) => jsx('p', { children: state.last }),
});

export default function Shop() {
  return jsx('main', { children: jsx(cart as any, {}) });
}
