import type { Origin } from '../define/types';

/**
 * Where the framework was when it failed. `ssr` is a page render, `invocation`
 * the single pipeline every intent/`api()` call goes through, `agent` the model
 * loop, `instrumentation` the app's own `instrumentation.ts`, and
 * `observability` the reporting machinery itself (a broken exporter).
 */
export type ErrorPhase = 'ssr' | 'invocation' | 'agent' | 'instrumentation' | 'observability';

export interface ErrorInfo {
  phase: ErrorPhase;
  /** `warning` is an expected, handled condition; `error` is a failure. */
  level?: 'error' | 'warning';
  /** The URL path being served, when the failure happened inside a request. */
  route?: string;
  /** The intent or `api()` tool name, in the invocation pipeline. */
  intent?: string;
  origin?: Origin;
}

export type ErrorHandler = (error: unknown, info: ErrorInfo) => void;

let handler: ErrorHandler | undefined;

/**
 * The app's global error sink — the other half of `_500.tsx`. That page is what
 * the visitor sees; this is what the operator sees, and it fires for the
 * failures no page can catch (the invocation pipeline, a render that already
 * flushed). Absent, failures keep going to the console exactly as before.
 */
export function setOnError(next: ErrorHandler | undefined): void {
  handler = next;
}

export function getOnError(): ErrorHandler | undefined {
  return handler;
}

/**
 * The single console sink. Every "expected but worth saying" condition in the
 * framework comes through `reportWarning`, so an app can route them somewhere
 * real by registering a handler instead of hunting for stray `console.warn`s.
 */
function toConsole(error: unknown, info: ErrorInfo): void {
  const where = [info.route, info.intent].filter(Boolean).join(' ');
  const label = `Janux: ${info.phase}${where ? ` (${where})` : ''} —`;

  if (info.level === 'warning') console.warn(label, error);
  else console.error(label, error);
}

/**
 * Fail-open in both directions: a handler that throws must not take the request
 * down (the failure it was told about is the one that matters), and a missing
 * handler still leaves a trace on the console.
 */
function report(error: unknown, info: ErrorInfo): void {
  if (!handler) return toConsole(error, info);
  try {
    handler(error, info);
  } catch (failure) {
    toConsole(failure, { phase: 'observability', level: 'warning' });
    toConsole(error, info);
  }
}

export function reportError(error: unknown, info: ErrorInfo): void {
  report(error, { ...info, level: 'error' });
}

export function reportWarning(message: string, info: ErrorInfo): void {
  report(new Error(message), { ...info, level: 'warning' });
}
