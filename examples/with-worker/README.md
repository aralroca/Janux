# Web Workers with `worker()`

The same prime-counting function, run two ways: on a Web Worker thread and on the main thread. A plain ticker on the page makes the difference impossible to miss — and easy to assert in a test.

- **One function, one wrapper** — `worker(countPrimes)` returns a function that takes the same arguments and returns a promise. There is no worker file to write, no `postMessage` protocol to hand-roll, no build configuration.
- **Measured, not claimed** — counting the primes below 10,000,000 takes ~1.9s either way. On the worker the ticker advances ~20 times during the run; on the main thread it advances **once**, because the page is frozen.
- **Known answers** — the presets are π(5·10⁶) = 348,513, π(10⁷) = 664,579 and π(1.5·10⁷) = 970,704, so the demo can be checked rather than admired.
- **Self-contained by design** — `worker()` ships the function to the thread as source, so it reads its arguments and nothing else. Capturing an outer helper fails loudly on the first call instead of silently reading `undefined`.
- **Works without workers** — where `Worker` does not exist (SSR, older runtimes) the same call runs the function inline, so the page still renders.

```bash
bun install
bun run dev     # http://localhost:4321
```

```bash
bun run build   # then: bun run start
```

## How it works

```tsx
import { worker } from 'janux/worker';

const countPrimes = (limit: number): number => {
  /* deliberately naive trial division */
};

const countPrimesOffThread = worker(countPrimes);

// inside an intent:
state.primes = await countPrimesOffThread(state.limit);
```

The ticker lives in the route, outside the island, so nothing the framework re-renders can be what moves it. See [Workers](https://janux.build/docs/reference/worker) in the docs for the full API and its boundary rules.
