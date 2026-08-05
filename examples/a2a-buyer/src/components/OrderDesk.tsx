import { component, int, intent, schema, str } from 'janux';
import { order, orderStatus, priceCheck } from '../server/purchasing.api';

/**
 * The buyer's desk. Each button is one A2A call to another app, made from this
 * app's own `api()` functions — the island never talks to the supplier itself.
 */

const ERROR_PREFIX = /^Error:\s*/;

/** The supplier's catalog is the source of truth; these are the skus this desk offers to try. */
const SKUS = ['MUG', 'TEE', 'CAP'];

const reason = (error: unknown) => String(error).replace(ERROR_PREFIX, '');

export const OrderDesk = component({
  name: 'order-desk',
  description: 'Buys from a supplier agent over A2A: quote, order, and follow what a human there decides.',

  state: schema({
    sku: str().default('MUG'),
    units: int().default(12),
    quote: str().default(''),
    taskId: str().default(''),
    approveAt: str().default(''),
    status: str().default(''),
    failure: str().default(''),
  }),

  intents: {
    pick: intent({
      description: 'Choose which sku to buy',
      input: schema({ sku: str().options(() => SKUS) }),
      run: ({ state, input }: any) => {
        state.sku = input.sku;
        state.quote = '';
      },
    }),

    quote: intent({
      description: 'Ask the supplier what this order would cost',
      run: async ({ state }: any) => {
        try {
          const priced: any = await priceCheck({ sku: state.sku, units: state.units });

          state.quote = `${priced.total}€ (${priced.unitPrice}€ per unit)`;
          state.failure = '';
        } catch (error) {
          state.failure = reason(error);
        }
      },
    }),

    order: intent({
      description: 'Ask the supplier to ship this order. It will need a human there.',
      run: async ({ state }: any) => {
        try {
          const parked: any = await order({ sku: state.sku, units: state.units });

          state.taskId = parked.taskId;
          state.approveAt = parked.approveAt;
          state.status = 'TASK_STATE_INPUT_REQUIRED';
          state.failure = '';
        } catch (error) {
          state.failure = reason(error);
        }
      },
    }),

    refresh: intent({
      description: 'Check what the supplier did with the parked order',
      ready: ({ state }: any) => state.taskId !== '',
      run: async ({ state }: any) => {
        const current: any = await orderStatus({ taskId: state.taskId });

        state.status = current.detail ? `${current.state} ${current.detail}` : current.state;
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="desk">
      <h2>Order from the supplier</h2>
      <div class="row">
        {SKUS.map((sku) => (
          <button key={sku} class={state.sku === sku ? 'sku on' : 'sku'} onClick={intents.pick.with({ sku })}>
            {sku}
          </button>
        ))}
        <span class="units">{state.units} units</span>
        <button class="quote" onClick={intents.quote}>
          Get a quote
        </button>
        <button class="order" onClick={intents.order}>
          Ask them to ship
        </button>
      </div>
      {state.quote !== '' && <p class="ok">Quote: {state.quote}</p>}
      {state.taskId !== '' && (
        <div class="parked">
          <p>
            Task <code class="task-id">{state.taskId}</code> is <code class="task-state">{state.status}</code>
          </p>
          {state.status.startsWith('TASK_STATE_INPUT_REQUIRED') ? (
            <p>
              The supplier parked it for one of its humans.{' '}
              {/* A new tab on purpose: the approval happens on the supplier's own
                  site, and this desk stays put so you can watch the task change. */}
              <a class="approve-link" href={state.approveAt} target="_blank" rel="noreferrer">
                Open the supplier's approval desk
              </a>{' '}
              then come back and refresh.
            </p>
          ) : (
            <p class="ok">A human at the supplier decided. Nothing here could have decided it.</p>
          )}
          <button class="refresh" onClick={intents.refresh}>
            Refresh the task
          </button>
        </div>
      )}
      {state.failure !== '' && <p class="bad">{state.failure}</p>}
    </section>
  ),
});
