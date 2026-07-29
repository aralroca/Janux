import { component, intent, source, onEvent, schema, str, int, list } from 'janux';
import { levels, restock, discard } from '../server/stock.api';

export const Stockroom = component({
  name: 'stockroom',
  description: 'Warehouse stock levels with restock and confirm-guarded write-off controls.',

  state: schema({ log: list({ line: str() }) }),

  sources: {
    levels: source({
      description: 'Current stock per SKU',
      query: () => levels({}),
      refresh: onEvent('stock.changed'),
    }),
  },

  emits: { 'stock.changed': schema({}) },

  intents: {
    restock: intent({
      description: 'Add units of a SKU to the shelf.',
      input: schema({ sku: str(), qty: int().min(1) }),
      run: async ({ state, input, emit }: any) => {
        const updated: any = await restock({ sku: input.sku, qty: input.qty });

        state.log.push({ line: `+${input.qty} ${updated.sku} → ${updated.stock} in stock` });
        emit('stock.changed', {});
      },
    }),

    writeOff: intent({
      description: 'Write off one damaged unit of a SKU. Destroys stock permanently.',
      guard: 'confirm',
      input: schema({ sku: str() }),
      run: async ({ state, input, emit }: any) => {
        const updated: any = await discard({ sku: input.sku, qty: 1, reason: 'damaged in handling' });

        state.log.push({ line: `-1 ${updated.sku} → ${updated.stock} in stock` });
        emit('stock.changed', {});
      },
    }),
  },

  view: ({ state, sources, intents }: any) => (
    <section class="stockroom">
      {sources.levels.pending ? (
        <p>Loading inventory…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sources.levels.value.items.map((entry: any) => (
              <tr key={entry.sku} class={entry.stock <= entry.low ? 'low' : ''}>
                <td>
                  <code>{entry.sku}</code>
                </td>
                <td>{entry.name}</td>
                <td>{entry.stock}</td>
                <td>
                  <button onClick={intents.restock.with({ sku: entry.sku, qty: 10 })}>+10</button>
                  <button class="danger" onClick={intents.writeOff.with({ sku: entry.sku })}>
                    Write off 1
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {state.log.length > 0 ? (
        <ul class="log">
          {state.log.map((entry: any, index: number) => (
            <li key={String(index)}>→ {entry.line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  ),
});
