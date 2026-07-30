import { bool, component, int, intent, num, schema } from 'janux';
import { worker } from 'janux/worker';

/**
 * Deliberately naive trial division. The whole point of the example is a
 * function heavy enough to freeze a page, so the hot numeric loop stays a hot
 * numeric loop — this is the one place where a declarative rewrite would
 * destroy what is being demonstrated.
 */
const countPrimes = (limit: number): number => {
  let count = 0;

  for (let n = 2; n <= limit; n++) {
    let prime = true;

    for (let d = 2; d * d <= n; d++) {
      if (n % d === 0) {
        prime = false;
        break;
      }
    }
    if (prime) count += 1;
  }

  return count;
};

/**
 * The very same function, one thread over. `worker()` ships it to the worker as
 * source, which is why `countPrimes` reads nothing but its own argument.
 */
const countPrimesOffThread = worker(countPrimes);

/** π(n) for each preset is a known value, so the demo can be checked, not just watched. */
const LIMITS = [5_000_000, 10_000_000, 15_000_000];

const format = (value: number) => value.toLocaleString('en-US');

export const PrimeLab = component({
  name: 'prime-lab',
  description: 'Counts primes below a limit, either on a Web Worker thread or on the main thread.',

  state: schema({
    limit: int().default(10_000_000),
    primes: int().default(0),
    elapsed: num().default(0),
    offThread: bool().default(true),
    running: bool().default(false),
  }),

  intents: {
    setLimit: intent({
      description: 'Choose how many numbers to scan.',
      input: schema({ limit: int() }),
      run: ({ state, input }: any) => {
        state.limit = input.limit;
        state.primes = 0;
        state.elapsed = 0;
      },
    }),

    countOffThread: intent({
      description: 'Count the primes on a Web Worker, leaving the page interactive.',
      run: async ({ state }: any) => {
        const started = performance.now();

        state.running = true;
        state.offThread = true;
        state.primes = await countPrimesOffThread(state.limit);
        state.elapsed = Math.round(performance.now() - started);
        state.running = false;
      },
    }),

    countOnMainThread: intent({
      description: 'Count the primes on the main thread — the page freezes until it finishes.',
      run: ({ state }: any) => {
        const started = performance.now();

        state.offThread = false;
        state.primes = countPrimes(state.limit);
        state.elapsed = Math.round(performance.now() - started);
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="lab">
      <div class="limits">
        {LIMITS.map((limit) => (
          <button
            key={limit}
            class={limit === state.limit ? 'limit active' : 'limit'}
            data-limit={String(limit)}
            onClick={intents.setLimit.with({ limit })}
          >
            {format(limit)}
          </button>
        ))}
      </div>

      <div class="actions">
        <button class="run worker" onClick={intents.countOffThread}>
          Count on a worker
        </button>
        <button class="run main" onClick={intents.countOnMainThread}>
          Count on the main thread
        </button>
      </div>

      <p class="result" data-primes={String(state.primes)} data-thread={state.offThread ? 'worker' : 'main'}>
        {state.primes > 0 ? (
          <>
            <strong>{format(state.primes)}</strong> primes below {format(state.limit)} — {state.elapsed} ms on the{' '}
            {state.offThread ? 'worker' : 'main'} thread
          </>
        ) : (
          <span class="idle">Pick a size and run it both ways — watch the ticker above.</span>
        )}
      </p>
    </section>
  ),
});
