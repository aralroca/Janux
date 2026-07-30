/**
 * `worker()` — run a function on a Web Worker thread.
 *
 * The function is shipped to the worker as source (`Function.prototype.toString`),
 * so it must be self-contained: it sees its arguments and the worker's own
 * globals, never the module scope it was written in. That boundary is the price
 * of needing no build step — a captured variable fails loudly on the first call
 * rather than silently reading `undefined`.
 */

export interface WorkerFunction<A extends unknown[], R> {
  (...args: A): Promise<R>;
  /** Stops the worker thread. A later call spawns a fresh one. */
  terminate(): void;
}

interface Settle {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface Response {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

interface WorkerState {
  source: string;
  pending: Map<number, Settle>;
  seq: number;
  instance?: Worker;
  objectUrl?: string;
}

/** The worker-side module: the function itself, plus the request/response protocol. */
function workerSource(body: string): string {
  return `const __run = (${body});
self.onmessage = async (event) => {
  const { id, args } = event.data;
  try {
    self.postMessage({ id, ok: true, value: await __run(...args) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String((error && error.message) || error) });
  }
};`;
}

/** Settles the one call a response belongs to; unknown ids are stale terminations. */
function receive(state: WorkerState, data: Response): void {
  const settle = state.pending.get(data.id);

  if (!settle) return;
  state.pending.delete(data.id);
  if (data.ok) settle.resolve(data.value);
  else settle.reject(new Error(data.error ?? 'Janux worker failed'));
}

/** A worker-level failure carries no request id, so every call in flight has to fail. */
function failAll(state: WorkerState, message: string): void {
  state.pending.forEach((settle) => settle.reject(new Error(message)));
  state.pending.clear();
}

function spawn(state: WorkerState): Worker {
  const blob = new Blob([state.source], { type: 'text/javascript' });

  state.objectUrl = URL.createObjectURL(blob);

  return new Worker(state.objectUrl, { type: 'module' });
}

function ensureWorker(state: WorkerState): Worker {
  if (state.instance) return state.instance;
  const instance = spawn(state);

  instance.onmessage = (event: MessageEvent<Response>) => receive(state, event.data);
  instance.onerror = (event: ErrorEvent) => failAll(state, event.message || 'Janux worker failed');
  state.instance = instance;

  return instance;
}

function call<R>(state: WorkerState, args: unknown[]): Promise<R> {
  const instance = ensureWorker(state);
  const id = (state.seq += 1);

  return new Promise<R>((resolve, reject) => {
    state.pending.set(id, { resolve: resolve as Settle['resolve'], reject });
    try {
      // An argument structured clone refuses (a DOM node, an event) throws here
      // — the call must fail without leaving its slot waiting forever.
      instance.postMessage({ id, args });
    } catch (error) {
      state.pending.delete(id);
      reject(error as Error);
    }
  });
}

function terminate(state: WorkerState): void {
  state.instance?.terminate();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.instance = undefined;
  state.objectUrl = undefined;
  failAll(state, 'Janux worker terminated');
}

/** SSR, and any runtime without Web Workers, runs the function inline instead. */
function supportsWorkers(): boolean {
  return typeof Worker !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/**
 * Moves `fn` onto a Web Worker thread. Calling the returned function always
 * returns a promise; arguments and the result cross the boundary by structured
 * clone, so they must be cloneable (no DOM nodes, no event objects, no
 * functions).
 *
 * ```ts
 * const fib = worker((n: number) => (n < 2 ? n : fibSync(n)));
 * const value = await fib(35);
 * ```
 */
export function worker<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>): WorkerFunction<A, R> {
  const state: WorkerState = { source: workerSource(fn.toString()), pending: new Map(), seq: 0 };
  const invoke = (...args: A): Promise<R> =>
    supportsWorkers() ? call<R>(state, args) : Promise.resolve(fn(...args));

  return Object.assign(invoke, { terminate: () => terminate(state) });
}
