import { component, intent, schema, str, int, list } from 'janux';

let toastSeq = 0;

/** Listens to typed cart events and shows dismissible toasts. */
export const Toasts = component({
  name: 'toasts',
  description: 'Transient notifications for shop events.',

  state: schema({ items: list({ id: str(), message: str() }) }),

  on: {
    'cart.checkedOut': ({ state, event }: any) => {
      toastSeq += 1;
      state.items.push({ id: `toast_${toastSeq}`, message: `🎉 Order ${event.orderId} confirmed — ${(event.total / 100).toFixed(2)}€` });
    },
  },

  intents: {
    dismiss: intent({
      description: 'Dismiss a toast by id',
      input: schema({ id: str() }),
      run: ({ state, input }: any) => {
        state.items = state.items.filter((toast: any) => toast.id !== input.id);
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <div class="toasts">
      {state.items.map((toast: any) => (
        <div key={toast.id} class="toast">
          <span>{toast.message}</span>
          <button on={intents.dismiss} data-input={JSON.stringify({ id: toast.id })}>
            ✕
          </button>
        </div>
      ))}
    </div>
  ),
});
