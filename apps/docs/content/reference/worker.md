# worker()

Runs a function on a Web Worker thread, so expensive work stops blocking clicks, typing, scrolling and animation.

```ts
import { worker } from 'janux/worker';
```

Runnable version: [`examples/with-worker`](https://github.com/aralroca/Janux/tree/main/examples/with-worker).

## Signature

```ts
function worker<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>): WorkerFunction<A, R>;

interface WorkerFunction<A extends unknown[], R> {
  (...args: A): Promise<R>;
  terminate(): void;
}
```

`worker()` takes a function and returns a function with the same arguments that **always returns a promise**, whatever the original returned.

```tsx
import { worker } from 'janux/worker';

export const countPrimes = worker((limit: number) => {
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
});
```

Calling it returns a promise, so it awaits like anything else — typically from an intent:

```ts
state.primes = await countPrimes(10_000_000);
```

## The boundary: the function must be self-contained

This is the one rule, and it is the price of needing no build step. The function is shipped to the worker **as source**, so it sees its own arguments and the worker's globals — never the module scope it was written in.

```ts
const scale = (n: number) => n * 3;

// ✗ `scale` does not exist on the worker thread.
const broken = worker((n: number) => scale(n));

// ✓ Everything it needs arrives as an argument.
const works = worker((n: number, factor: number) => n * factor);
```

A captured variable is not silently `undefined`: the call **rejects** with the ReferenceError from the worker, on the first call.

Arguments and return values cross by [structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), so they must be cloneable. Numbers, strings, plain objects, arrays, `Map`, `Set`, `Date` and typed arrays are fine. DOM nodes, event objects and functions are not — read what you need from an event first, then pass that:

```tsx
<input onInput={(event) => parse((event.target as HTMLInputElement).value)} />
```

## Lifecycle

The thread is **spawned lazily**, on the first call, and reused by every call after it. Concurrent calls are correlated by id, so overlapping calls resolve to their own results:

```ts
const [a, b, c] = await Promise.all([echo(1), echo(2), echo(3)]);
```

`terminate()` stops the thread and rejects everything still in flight. A later call spawns a fresh one, so terminating is a way to reclaim memory, not a way to permanently disable the function.

```ts
countPrimes.terminate();
```

## Without Web Workers

Where `Worker` does not exist — server-side rendering, or an older runtime — the same call runs the function inline and resolves with its result. Code that awaits a `worker()` function therefore works unchanged on both sides, and SSR never fails because a thread was unavailable.

## What belongs on a worker

Moving work to a thread is not free: the arguments and the result have to be cloned across it. It pays when the work is meaningfully heavier than that copy.

Worth it: parsing or formatting large payloads, compression, hashing, image or audio processing, search indexing, anything that would otherwise drop frames.

Not worth it: small computations, anything dominated by network waiting (a `fetch` already does not block the main thread), and anything that needs the DOM — a worker has no `document`.

## Proving it works

The honest test is not that the result came back; it is that the main thread stayed free while it did. The example measures this with an interval outside the island: on the worker it keeps counting during the run, on the main thread it stops dead.
