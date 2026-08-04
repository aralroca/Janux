import { worker } from 'janux/worker';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `worker()`: what actually survives the thread boundary, and what a failure on
 * the other side looks like from here.
 *
 * The function is shipped as SOURCE, so the boundary is real in a way a mock
 * cannot reproduce — every case below spawns a Bun worker thread. Three
 * separate contracts live here: structured clone decides which VALUES cross,
 * the request/response protocol decides which CALL a result belongs to, and the
 * inline fallback (SSR, and any runtime without Web Workers) has to fail in the
 * same shape the threaded path does — otherwise identical code needs a
 * try/catch on the server and none on the client.
 */

const RealWorker = globalThis.Worker;

/** Runs `body` with Web Workers taken away — the SSR path. */
async function withoutWorkers(body: () => Promise<void>): Promise<void> {
  // @ts-expect-error — removing the global is the point.
  delete globalThis.Worker;
  try {
    await body();
  } finally {
    globalThis.Worker = RealWorker;
  }
}

export const WORKER_CASES: ScenarioCase[] = [
  // ── values that cross intact ────────────────────────────────────────────────
  {
    id: 'worker-returns-a-string-from-the-other-thread',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: string) => value.toUpperCase());

      log.push(await echo('hi'));
      echo.terminate();
    },
    expected: ['HI'],
  },
  {
    id: 'worker-returns-undefined-as-undefined-not-null',
    src: 'janux',
    run: async (log) => {
      const nothing = worker(() => undefined);

      log.push(String(await nothing()));
      nothing.terminate();
    },
    expected: ['undefined'],
  },
  {
    id: 'worker-distinguishes-a-null-result-from-undefined',
    src: 'janux',
    run: async (log) => {
      const nil = worker(() => null);

      log.push(JSON.stringify(await nil()));
      nil.terminate();
    },
    expected: ['null'],
  },
  {
    id: 'worker-returns-a-nested-object-graph',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => ({ a: { b: [1, { c: 'd' }] } }));

      log.push(JSON.stringify(await build()));
      build.terminate();
    },
    expected: ['{"a":{"b":[1,{"c":"d"}]}}'],
  },
  {
    id: 'worker-returns-a-date-as-a-date-not-as-a-string',
    src: 'janux',
    run: async (log) => {
      // Structured clone, not JSON: the difference is the whole reason the
      // protocol posts values instead of stringifying them.
      const stamp = worker(() => new Date('2020-01-02T03:04:05Z'));
      const value = await stamp();

      log.push(`isDate=${value instanceof Date}`, value.toISOString());
      stamp.terminate();
    },
    expected: ['isDate=true', '2020-01-02T03:04:05.000Z'],
  },
  {
    id: 'worker-returns-a-map-with-its-entries',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => new Map([['a', 1]]));
      const value = await build();

      log.push(`isMap=${value instanceof Map}`, String(value.get('a')));
      build.terminate();
    },
    expected: ['isMap=true', '1'],
  },
  {
    id: 'worker-returns-a-set-with-its-members',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => new Set([1, 2, 2]));
      const value = await build();

      log.push(`isSet=${value instanceof Set}`, String(value.size));
      build.terminate();
    },
    expected: ['isSet=true', '2'],
  },
  {
    id: 'worker-returns-a-regexp-with-its-flags',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => /ab+c/gi);

      log.push(String(await build()));
      build.terminate();
    },
    expected: ['/ab+c/gi'],
  },
  {
    id: 'worker-returns-a-bigint-beyond-safe-integer-range',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => 9007199254740993n);

      log.push(String(await build()));
      build.terminate();
    },
    expected: ['9007199254740993'],
  },
  {
    id: 'worker-returns-a-typed-array-with-its-bytes',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => new Uint8Array([1, 2, 3]));
      const value = await build();

      log.push(`isTyped=${value instanceof Uint8Array}`, value.join(','));
      build.terminate();
    },
    expected: ['isTyped=true', '1,2,3'],
  },
  {
    id: 'worker-returns-an-error-as-a-value-without-rejecting',
    src: 'janux',
    run: async (log) => {
      // Returning an error is a result, not a failure: a validation worker that
      // answers "here is what is wrong" must not reject.
      const build = worker(() => new RangeError('out of range'));
      const value = await build();

      log.push(`isError=${value instanceof Error}`, value.message);
      build.terminate();
    },
    expected: ['isError=true', 'out of range'],
  },
  {
    id: 'worker-returns-a-cyclic-graph-as-the-same-cycle',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => {
        const node: Record<string, unknown> = { name: 'root' };

        node.self = node;

        return node;
      });
      const value = (await build()) as Record<string, unknown>;

      log.push(String(value.self === value));
      build.terminate();
    },
    expected: ['true'],
  },
  {
    id: 'worker-carries-a-megabyte-payload-whole',
    src: 'janux',
    run: async (log) => {
      const build = worker((size: number) => 'x'.repeat(size));

      log.push(String((await build(1_000_000)).length));
      build.terminate();
    },
    expected: ['1000000'],
  },

  // ── arguments: how the call gets there ──────────────────────────────────────
  {
    id: 'worker-passes-several-arguments-positionally',
    src: 'janux',
    run: async (log) => {
      const join = worker((a: string, b: string, c: string) => [a, b, c].join('-'));

      log.push(await join('x', 'y', 'z'));
      join.terminate();
    },
    expected: ['x-y-z'],
  },
  {
    id: 'worker-leaves-a-missing-argument-undefined',
    src: 'janux',
    run: async (log) => {
      const arity = worker((a?: number, b?: number) => `${a}:${b}`);

      log.push(await arity(1));
      arity.terminate();
    },
    expected: ['1:undefined'],
  },
  {
    id: 'worker-applies-a-default-parameter-on-the-other-side',
    src: 'janux',
    run: async (log) => {
      const scaled = worker((value: number, factor: number = 3) => value * factor);

      log.push(String(await scaled(2)));
      scaled.terminate();
    },
    expected: ['6'],
  },
  {
    id: 'worker-forwards-every-rest-argument',
    src: 'janux',
    run: async (log) => {
      const sum = worker((...values: number[]) => values.reduce((total, value) => total + value, 0));

      log.push(String(await sum(1, 2, 3, 4)));
      sum.terminate();
    },
    expected: ['10'],
  },
  {
    id: 'worker-copies-its-arguments-so-a-mutation-does-not-reach-the-caller',
    src: 'janux',
    run: async (log) => {
      // The single most surprising consequence of the boundary: the worker gets
      // a CLONE, so "the function mutated my object" is silently not true.
      const bump = worker((bag: { n: number }) => {
        bag.n += 1;

        return bag.n;
      });
      const bag = { n: 1 };

      log.push(`returned=${await bump(bag)}`, `caller=${bag.n}`);
      bump.terminate();
    },
    expected: ['returned=2', 'caller=1'],
  },
  {
    id: 'worker-copies-an-array-buffer-argument-instead-of-transferring-it',
    src: 'janux',
    run: async (log) => {
      // No transfer list is sent, so nothing is neutered: the caller's buffer is
      // as usable after the call as before it (at the cost of a copy).
      const size = worker((buffer: ArrayBuffer) => buffer.byteLength);
      const buffer = new ArrayBuffer(64);

      log.push(`read=${await size(buffer)}`, `caller=${buffer.byteLength}`, `detached=${buffer.detached}`);
      size.terminate();
    },
    expected: ['read=64', 'caller=64', 'detached=false'],
  },
  {
    id: 'worker-rejects-a-symbol-argument-structured-clone-cannot-carry',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: unknown) => value);

      await attempt(log, 'call', () => echo(Symbol('nope')));
      echo.terminate();
    },
    expected: ['call:threw:The object can not be cloned.'],
  },
  {
    id: 'worker-carries-a-cyclic-argument',
    src: 'janux',
    run: async (log) => {
      const naming = worker((node: { name: string; self?: unknown }) => `${node.name}:${node.self === node}`);
      const node: { name: string; self?: unknown } = { name: 'root' };

      node.self = node;
      log.push(await naming(node));
      naming.terminate();
    },
    expected: ['root:true'],
  },

  // ── failure on the other thread ─────────────────────────────────────────────
  {
    id: 'worker-rejects-with-the-message-of-an-async-rejection',
    src: 'janux',
    run: async (log) => {
      const failing = worker(async () => {
        await Promise.resolve();

        throw new Error('async boom');
      });

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:async boom'],
  },
  {
    id: 'worker-rejects-with-the-text-of-a-thrown-string',
    src: 'janux',
    run: async (log) => {
      const failing = worker(() => {
        throw 'just a string';
      });

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:just a string'],
  },
  {
    id: 'worker-rejects-with-something-nameable-when-the-error-has-no-message',
    src: 'janux',
    run: async (log) => {
      const failing = worker(() => {
        throw new Error('');
      });

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:Error'],
  },
  {
    id: 'worker-rejects-when-the-thrown-value-is-null',
    src: 'janux',
    run: async (log) => {
      const failing = worker(() => {
        throw null;
      });

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:null'],
  },
  {
    id: 'worker-rejects-when-the-result-cannot-be-cloned-back',
    src: 'janux',
    run: async (log) => {
      // The failure happens INSIDE the worker, after the function succeeded —
      // it still has to arrive as a rejection of that one call.
      const failing = worker(() => () => 'a function');

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:The object can not be cloned.'],
  },
  {
    id: 'worker-rejects-a-later-call-after-one-failed',
    src: 'janux',
    run: async (log) => {
      const maybe = worker((value: number) => {
        if (value < 0) throw new Error('negative');

        return value;
      });

      await attempt(log, 'first', () => maybe(-1));
      log.push(`second=${await maybe(2)}`);
      maybe.terminate();
    },
    expected: ['first:threw:negative', 'second=2'],
  },
  {
    id: 'worker-fails-every-call-in-flight-when-the-thread-itself-dies',
    src: 'janux',
    run: async (log) => {
      // A native function's source is not a valid expression, so the worker
      // module never evaluates: the failure has no request id attached to it.
      const broken = worker(Math.max as never);
      const results = await Promise.allSettled([broken(1), broken(2)]);

      log.push(results.map((result) => result.status).join(','));
      broken.terminate();
    },
    expected: ['rejected,rejected'],
  },
  {
    id: 'worker-does-not-hang-forever-on-a-call-made-after-the-thread-died',
    src: 'janux',
    run: async (log) => {
      // The dead instance used to be kept: the next `postMessage` went into a
      // worker whose `onmessage` was never installed, and that promise never
      // settled — a hang with no error anywhere.
      const broken = worker(Math.max as never);
      const settles = (call: Promise<unknown>) =>
        Promise.race([
          call.then(() => 'resolved', () => 'rejected'),
          new Promise((resolve) => setTimeout(() => resolve('hung'), 1000)),
        ]);

      log.push(`first=${await settles(broken(1))}`, `second=${await settles(broken(2))}`);
      broken.terminate();
    },
    expected: ['first=rejected', 'second=rejected'],
  },

  // ── the protocol: which answer belongs to which call ────────────────────────
  {
    id: 'worker-settles-each-of-fifty-concurrent-calls-with-its-own-result',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: number) => value * 2);
      const results = await Promise.all(Array.from({ length: 50 }, (_, index) => echo(index)));

      log.push(String(results.every((value, index) => value === index * 2)), String(results.length));
      echo.terminate();
    },
    expected: ['true', '50'],
  },
  {
    id: 'worker-keeps-results-with-their-calls-when-they-finish-out-of-order',
    src: 'janux',
    run: async (log) => {
      const delayed = worker(async (value: string, ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms));

        return value;
      });
      const slow = delayed('slow', 30);
      const fast = delayed('fast', 1);

      log.push(await fast, await slow);
      delayed.terminate();
    },
    expected: ['fast', 'slow'],
  },
  {
    id: 'worker-mixes-successes-and-failures-in-the-same-batch',
    src: 'janux',
    run: async (log) => {
      const maybe = worker((value: number) => {
        if (value % 2 === 0) throw new Error(`even ${value}`);

        return value;
      });
      const results = await Promise.allSettled([maybe(1), maybe(2), maybe(3), maybe(4)]);

      log.push(results.map((result) => (result.status === 'fulfilled' ? String(result.value) : 'x')).join(','));
      maybe.terminate();
    },
    expected: ['1,x,3,x'],
  },
  {
    id: 'worker-rejects-the-calls-still-in-flight-when-it-is-terminated',
    src: 'janux',
    run: async (log) => {
      const slow = worker(() => new Promise(() => undefined));
      const pending = slow();

      slow.terminate();
      await attempt(log, 'pending', () => pending);
    },
    expected: ['pending:threw:Janux worker terminated'],
  },
  {
    id: 'worker-terminating-before-the-first-call-is-harmless',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: string) => value);

      attempt(log, 'terminate', () => echo.terminate());
      log.push(await echo('after'));
      echo.terminate();
    },
    expected: ['terminate:ok', 'after'],
  },
  {
    id: 'worker-terminating-twice-is-harmless',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: string) => value);

      log.push(await echo('once'));
      echo.terminate();
      attempt(log, 'again', () => echo.terminate());
    },
    expected: ['once', 'again:ok'],
  },
  {
    id: 'worker-revokes-the-object-url-of-every-thread-it-spawned',
    src: 'janux',
    run: async (log) => {
      const created: string[] = [];
      const revoked: string[] = [];
      const realCreate = URL.createObjectURL;
      const realRevoke = URL.revokeObjectURL;

      URL.createObjectURL = (blob: Blob) => {
        const url = realCreate.call(URL, blob);

        created.push(url);

        return url;
      };
      URL.revokeObjectURL = (url: string) => {
        revoked.push(url);
        realRevoke.call(URL, url);
      };
      try {
        const echo = worker((value: string) => value);

        await echo('one');
        echo.terminate();
        await echo('two');
        echo.terminate();
        log.push(`created=${created.length}`, `revoked=${revoked.length}`, `leaked=${created.filter((url) => !revoked.includes(url)).length}`);
      } finally {
        URL.createObjectURL = realCreate;
        URL.revokeObjectURL = realRevoke;
      }
    },
    expected: ['created=2', 'revoked=2', 'leaked=0'],
  },

  // ── the source boundary: what the shipped function can and cannot see ───────
  {
    id: 'worker-cannot-see-the-module-scope-it-was-written-in',
    src: 'janux',
    run: async (log) => {
      const secret = { token: 'abc' };
      const leak = worker(() => JSON.stringify(secret));

      await attempt(log, 'call', () => leak());
      leak.terminate();
    },
    expected: ['call:threw:secret is not defined'],
  },
  {
    id: 'worker-can-call-itself-through-its-own-name',
    src: 'janux',
    run: async (log) => {
      // A named function expression keeps its own binding in its source, which
      // is the only way a recursive worker function can work at all.
      const fib: (n: number) => Promise<number> = worker(function fib(n: number): number {
        return n < 2 ? n : fib(n - 1) + fib(n - 2);
      });

      log.push(String(await fib(20)));
      (fib as unknown as { terminate(): void }).terminate();
    },
    expected: ['6765'],
  },
  {
    id: 'worker-sees-the-worker-globals-and-no-document',
    src: 'janux',
    run: async (log) => {
      const probe = worker(() => `${typeof self}:${typeof document}:${typeof postMessage}`);

      log.push(await probe());
      probe.terminate();
    },
    expected: ['object:undefined:function'],
  },
  {
    id: 'worker-can-use-web-platform-apis-that-exist-on-a-thread',
    src: 'janux',
    run: async (log) => {
      const encode = worker((text: string) => new TextEncoder().encode(text).length);

      log.push(String(await encode('héllo')));
      encode.terminate();
    },
    expected: ['6'],
  },
  {
    id: 'worker-runs-the-function-with-no-this',
    src: 'janux',
    run: async (log) => {
      const probe = worker(function (this: unknown) {
        return typeof this;
      });

      log.push(await probe());
      probe.terminate();
    },
    expected: ['undefined'],
  },
  {
    id: 'worker-ships-an-async-arrow-as-readily-as-a-declaration',
    src: 'janux',
    run: async (log) => {
      const arrow = worker(async (value: number) => value + 1);

      log.push(String(await arrow(1)));
      arrow.terminate();
    },
    expected: ['2'],
  },
  {
    id: 'worker-spawns-one-thread-for-many-calls-and-a-new-one-after-terminate',
    src: 'janux',
    run: async (log) => {
      let constructed = 0;

      globalThis.Worker = class extends RealWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          constructed += 1;
        }
      } as unknown as typeof Worker;
      try {
        const echo = worker((value: string) => value);

        await Promise.all([echo('a'), echo('b'), echo('c')]);
        log.push(`afterCalls=${constructed}`);
        echo.terminate();
        await echo('d');
        log.push(`afterRespawn=${constructed}`);
        echo.terminate();
      } finally {
        globalThis.Worker = RealWorker;
      }
    },
    expected: ['afterCalls=1', 'afterRespawn=2'],
  },

  // ── the inline fallback: SSR, and any runtime without Web Workers ───────────
  {
    id: 'worker-runs-inline-when-the-runtime-has-no-worker-constructor',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        const add = worker((a: number, b: number) => a + b);

        log.push(String(await add(20, 22)));
      }),
    expected: ['42'],
  },
  {
    id: 'worker-inline-still-answers-with-a-promise-for-a-synchronous-function',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        const add = worker((a: number, b: number) => a + b);
        const result = add(1, 1);

        log.push(`isPromise=${result instanceof Promise}`, String(await result));
      }),
    expected: ['isPromise=true', '2'],
  },
  {
    id: 'worker-inline-rejects-a-synchronous-throw-instead-of-throwing-at-the-call-site',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        // The same code must not need a try/catch on the server and a `.catch()`
        // on the client: inline is a fallback, not a different API.
        const boom = worker(() => {
          throw new Error('inline boom');
        });

        await attempt(log, 'call', () => boom());
      }),
    expected: ['call:threw:inline boom'],
  },
  {
    id: 'worker-inline-rejects-an-async-failure-the-same-way',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        const boom = worker(async () => {
          throw new Error('inline async boom');
        });

        await attempt(log, 'call', () => boom());
      }),
    expected: ['call:threw:inline async boom'],
  },
  {
    id: 'worker-inline-sees-the-module-scope-a-real-thread-cannot',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        // An honest record of the one place the fallback is NOT equivalent: code
        // that captures its module scope works on the server and fails on the
        // client, which is why the boundary is documented rather than hidden.
        const factor = 3;
        const scaled = worker((value: number) => value * factor);

        log.push(String(await scaled(2)));
      }),
    expected: ['6'],
  },
  {
    id: 'worker-inline-passes-arguments-by-reference-rather-than-by-clone',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        const bump = worker((bag: { n: number }) => (bag.n += 1));
        const bag = { n: 1 };

        await bump(bag);
        log.push(`caller=${bag.n}`);
      }),
    expected: ['caller=2'],
  },
  {
    id: 'worker-inline-returns-values-structured-clone-would-refuse',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        const build = worker(() => () => 'a function');

        log.push(typeof (await build()));
      }),
    expected: ['function'],
  },
  {
    id: 'worker-inline-terminate-is-harmless-because-nothing-was-spawned',
    src: 'janux',
    run: (log) =>
      withoutWorkers(async () => {
        const echo = worker((value: string) => value);

        log.push(await echo('before'));
        attempt(log, 'terminate', () => echo.terminate());
        log.push(await echo('after'));
      }),
    expected: ['before', 'terminate:ok', 'after'],
  },
  {
    id: 'worker-decides-inline-or-threaded-per-call-not-once-at-definition',
    src: 'janux',
    run: async (log) => {
      // Definition happens at import time, which on a server-rendered page is
      // before the client runtime exists: a decision frozen there would run
      // every call inline forever.
      const echo = worker((value: string) => value);

      await withoutWorkers(async () => {
        log.push(`inline=${await echo('a')}`);
      });
      log.push(`threaded=${await echo('b')}`);
      echo.terminate();
    },
    expected: ['inline=a', 'threaded=b'],
  },

  // ── what structured clone quietly changes on the way back ──────────────────
  {
    id: 'worker-returns-a-class-instance-as-a-plain-object',
    src: 'janux',
    run: async (log) => {
      // Structured clone carries DATA, not prototypes: a worker cannot hand back
      // anything with methods, and a caller expecting `value.area()` gets a
      // TypeError far from here.
      const build = worker(() => {
        class Point {
          constructor(readonly x: number) {}
          double() {
            return this.x * 2;
          }
        }

        return new Point(3);
      });
      const value = (await build()) as { x: number; double?: unknown };

      log.push(`x=${value.x}`, `methods=${typeof value.double}`, `constructor=${value.constructor.name}`);
      build.terminate();
    },
    expected: ['x=3', 'methods=undefined', 'constructor=Object'],
  },
  {
    id: 'worker-flattens-a-getter-into-the-value-it-returned',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => ({
        get total() {
          return 42;
        },
      }));
      const value = await build();

      log.push(JSON.stringify(value), String(Object.getOwnPropertyDescriptor(value, 'total')!.get));
      build.terminate();
    },
    expected: ['{"total":42}', 'undefined'],
  },
  {
    id: 'worker-keeps-a-key-whose-value-is-undefined',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => ({ present: undefined, other: 1 }));
      const value = await build();

      log.push(`keys=${Object.keys(value).join(',')}`, `present=${'present' in value}`);
      build.terminate();
    },
    expected: ['keys=present,other', 'present=true'],
  },
  {
    id: 'worker-preserves-nan-negative-zero-and-infinity',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => [Number.NaN, -0, Number.POSITIVE_INFINITY]);
      const [nan, negativeZero, infinity] = await build();

      log.push(String(Number.isNaN(nan)), String(Object.is(negativeZero, -0)), String(infinity));
      build.terminate();
    },
    expected: ['true', 'true', 'Infinity'],
  },
  {
    id: 'worker-returns-an-invalid-date-as-an-invalid-date',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => new Date('not a date'));
      const value = await build();

      log.push(`isDate=${value instanceof Date}`, String(value));
      build.terminate();
    },
    expected: ['isDate=true', 'Invalid Date'],
  },
  {
    id: 'worker-returns-a-blob-a-json-protocol-could-not-carry',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => new Blob(['hello']));
      const value = await build();

      log.push(`isBlob=${value instanceof Blob}`, `size=${value.size}`);
      build.terminate();
    },
    expected: ['isBlob=true', 'size=5'],
  },
  {
    id: 'worker-rejects-a-url-object-structured-clone-does-not-support',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => new URL('https://example.test/path'));

      await attempt(log, 'call', () => build());
      build.terminate();
    },
    expected: ['call:threw:The object can not be cloned.'],
  },
  {
    id: 'worker-carries-a-map-nested-inside-an-array-inside-an-object',
    src: 'janux',
    run: async (log) => {
      const build = worker(() => ({ layers: [new Map([['deep', new Set([1])]])] }));
      const value = await build();
      const inner = value.layers[0]!.get('deep')!;

      log.push(`isMap=${value.layers[0] instanceof Map}`, `isSet=${inner instanceof Set}`, String(inner.has(1)));
      build.terminate();
    },
    expected: ['isMap=true', 'isSet=true', 'true'],
  },

  // ── isolation: one handle, one thread, no shared memory ────────────────────
  {
    id: 'worker-gives-two-handles-two-independent-threads',
    src: 'janux',
    run: async (log) => {
      // Each handle ships its own source to its own thread: a counter in one is
      // invisible to the other, which is what makes them safe to hand around.
      const makeCounter = () =>
        worker(() => {
          const scope = self as unknown as { count?: number };

          scope.count = (scope.count ?? 0) + 1;

          return scope.count;
        });
      const left = makeCounter();
      const right = makeCounter();

      log.push(`left=${await left()}`, `left=${await left()}`, `right=${await right()}`);
      left.terminate();
      right.terminate();
    },
    expected: ['left=1', 'left=2', 'right=1'],
  },
  {
    id: 'worker-starts-a-respawned-thread-with-nothing-remembered',
    src: 'janux',
    run: async (log) => {
      const counter = worker(() => {
        const scope = self as unknown as { count?: number };

        scope.count = (scope.count ?? 0) + 1;

        return scope.count;
      });

      log.push(`first=${await counter()}`, `second=${await counter()}`);
      counter.terminate();
      log.push(`afterTerminate=${await counter()}`);
      counter.terminate();
    },
    expected: ['first=1', 'second=2', 'afterTerminate=1'],
  },
  {
    id: 'worker-keeps-two-hundred-sequential-calls-in-order-on-one-thread',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: number) => value);
      const results: number[] = [];

      for (let step = 0; step < 200; step += 1) results.push(await echo(step));
      log.push(String(results.every((value, index) => value === index)), String(results.length));
      echo.terminate();
    },
    expected: ['true', '200'],
  },
  {
    id: 'worker-terminating-mid-batch-rejects-what-had-not-answered-yet',
    src: 'janux',
    run: async (log) => {
      const slow = worker(async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms));

        return ms;
      });
      const calls = [slow(0), slow(500), slow(500)];

      await calls[0];
      slow.terminate();
      const settled = await Promise.allSettled(calls);

      log.push(settled.map((result) => result.status).join(','));
    },
    expected: ['fulfilled,rejected,rejected'],
  },
  {
    id: 'worker-returns-a-callable-handle-that-is-not-the-original-function',
    src: 'janux',
    run: (log) => {
      const original = (value: number) => value;
      const handle = worker(original);

      log.push(`same=${(handle as unknown) === original}`, `terminate=${typeof handle.terminate}`);
      handle.terminate();
    },
    expected: ['same=false', 'terminate=function'],
  },
  {
    id: 'worker-queues-calls-made-before-the-thread-has-finished-starting',
    src: 'janux',
    run: async (log) => {
      // Spawning is lazy AND asynchronous: the first burst of calls is posted
      // into a worker whose module has not evaluated yet, and none may be lost.
      const echo = worker((value: number) => value);
      const results = await Promise.all(Array.from({ length: 25 }, (_, index) => echo(index)));

      log.push(String(results.length), String(results.every((value, index) => value === index)));
      echo.terminate();
    },
    expected: ['25', 'true'],
  },
  {
    id: 'worker-rejects-with-the-message-of-a-custom-error-subclass',
    src: 'janux',
    run: async (log) => {
      // Only the message survives — the protocol carries a string, so a caller
      // cannot branch on `instanceof` across the boundary.
      const failing = worker(() => {
        class HttpError extends Error {}

        throw new HttpError('418 teapot');
      });

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:418 teapot'],
  },
  {
    id: 'worker-rejects-when-the-function-rejects-with-a-non-error-value',
    src: 'janux',
    run: async (log) => {
      const failing = worker(async () => {
        await Promise.reject({ code: 42 });
      });

      await attempt(log, 'call', () => failing());
      failing.terminate();
    },
    expected: ['call:threw:[object Object]'],
  },
  {
    id: 'worker-resolves-with-undefined-when-an-async-function-returns-nothing',
    src: 'janux',
    run: async (log) => {
      const nothing = worker(async () => {
        await Promise.resolve();
      });

      log.push(String(await nothing()));
      nothing.terminate();
    },
    expected: ['undefined'],
  },
  {
    id: 'worker-carries-a-ten-megabyte-typed-array',
    src: 'janux',
    run: async (log) => {
      const build = worker((size: number) => new Uint8Array(size).fill(7));
      const value = await build(10_000_000);

      log.push(`length=${value.length}`, `first=${value[0]}`, `last=${value[value.length - 1]}`);
      build.terminate();
    },
    expected: ['length=10000000', 'first=7', 'last=7'],
  },
  {
    id: 'worker-runs-three-handles-in-parallel-without-crossing-their-results',
    src: 'janux',
    run: async (log) => {
      const tag = (label: string) => worker((value: number) => `${value}`);
      const handles = ['a', 'b', 'c'].map((label) => ({ label, handle: tag(label) }));
      const results = await Promise.all(handles.map(({ label, handle }, index) => handle(index).then((value) => `${label}${value}`)));

      log.push(results.join(','));
      handles.forEach(({ handle }) => handle.terminate());
    },
    expected: ['a0,b1,c2'],
  },
  {
    id: 'worker-still-answers-after-a-call-whose-argument-was-refused',
    src: 'janux',
    run: async (log) => {
      const echo = worker((value: unknown) => value);

      await attempt(log, 'bad', () => echo(new WeakMap()));
      log.push(`after=${await echo('fine')}`);
      echo.terminate();
    },
    expected: ['bad:threw:The object can not be cloned.', 'after=fine'],
  },
  {
    id: 'worker-uses-the-timers-of-its-own-thread-not-the-page',
    src: 'janux',
    run: async (log) => {
      // The point of moving work off the main thread: a busy loop there does not
      // stop this one from answering.
      const sleeper = worker(async (ms: number) => {
        const started = performance.now();

        await new Promise((resolve) => setTimeout(resolve, ms));

        // Half the delay, not all of it: what separates a real sleep from a
        // call that never left is orders of magnitude, while a runtime may
        // fire a timer a fraction early and `Date.now()` floors to whole
        // milliseconds — so an honest 20ms wait can read back as 19.
        return performance.now() - started > ms / 2;
      });

      log.push(String(await sleeper(20)));
      sleeper.terminate();
    },
    expected: ['true'],
  },
];
