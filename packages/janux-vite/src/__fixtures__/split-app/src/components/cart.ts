import { component, intent, jsx, schema, str } from 'janux';
import { label } from './helper';

export const Cart = component({
  name: 'cart',
  state: schema({ note: str() }),
  intents: {
    save: intent({
      description: 'Persist the note',
      input: schema({ note: str() }),
      run: ({ state, input }: any) => {
        state.note = label(String(input.note));
      },
    }),
  },
  view: () => jsx('output', { children: 'x' }),
});
