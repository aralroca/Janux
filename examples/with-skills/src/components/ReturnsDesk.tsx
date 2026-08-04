import { component, intent, source, onEvent, schema, str } from 'janux';
import { orders_list, levels } from '../server/returns.api';

export const ReturnsDesk = component({
  name: 'returns-desk',
  description: 'Open return requests and the shelf they come back to.',

  state: schema({ note: str().default('') }),

  sources: {
    requests: source({
      description: 'Open return requests',
      query: () => orders_list({}),
      refresh: onEvent('returns.changed'),
    }),
    shelf: source({
      description: 'Current stock per SKU',
      query: () => levels({}),
      refresh: onEvent('returns.changed'),
    }),
  },

  emits: { 'returns.changed': schema({}) },

  intents: {
    note: intent({
      description: 'Leave a short note on the desk for the next person on shift.',
      input: schema({ text: str().max(120) }),
      run: ({ state, input }: any) => {
        state.note = input.text;
      },
    }),
  },

  view: ({ state, requests, shelf }: any) => (
    <section class="desk">
      <h2>Open returns</h2>
      <ul class="orders">
        {(requests?.orders ?? []).map((order: any) => (
          <li key={order.id}>
            <strong>{order.id}</strong> — {order.qty}× {order.sku}, {order.reason} ({order.status})
          </li>
        ))}
      </ul>
      <h2>Shelf</h2>
      <ul class="shelf">
        {(shelf?.items ?? []).map((item: any) => (
          <li key={item.sku}>
            {item.sku}: {item.stock}
          </li>
        ))}
      </ul>
      {state.note ? <p class="note">Note: {state.note}</p> : null}
    </section>
  ),
});
