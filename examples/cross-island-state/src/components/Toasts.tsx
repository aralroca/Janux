import { component, intent, list, schema, str } from 'janux';

let toastSeq = 0;

/**
 * Island D: no `use`, no shared data — it only *reacts*. The cart store emits
 * `cart.itemAdded` on the page bus (one `createBus()` per page, created and
 * wired by the runtime inside `boot()`), and this `on:` handler is how one
 * island hears another without importing it.
 */
export const Toasts = component({
  name: 'toasts',
  description: 'Transient notifications fed by cart bus events.',
  state: schema({ items: list({ id: str(), message: str() }) }),
  on: {
    'cart.itemAdded': ({ state, event }) => {
      toastSeq += 1;
      state.items.push({ id: `toast_${toastSeq}`, message: `${event.name} added to the cart` });
    },
  },
  intents: {
    dismiss: intent({
      description: 'Dismiss a toast by id',
      input: schema({ id: str() }),
      run: ({ state, input }) => {
        state.items = state.items.filter((toast: any) => toast.id !== input.id);
      },
    }),
  },
  view: ({ state, intents }: any) => (
    <div class="toasts">
      {state.items.map((toast: any) => (
        <div key={toast.id} class="toast">
          <span>{toast.message}</span>
          <button onClick={intents.dismiss.with({ id: toast.id })}>✕</button>
        </div>
      ))}
    </div>
  ),
});
