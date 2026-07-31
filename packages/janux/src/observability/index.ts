/**
 * `janux/observability` — the seam an app's `instrumentation.ts` wires up.
 *
 * Nothing here is on by default: with no tracer and no error handler
 * registered, every call in this module is a branch on a module-level
 * `undefined`, which is what keeps an uninstrumented app exactly as fast as it
 * was before this file existed.
 */
export { isTracing, setTracer, withSpan } from './tracing';
export type { AttributeValue, JanuxSpan, JanuxTracer, SpanAttributes } from './tracing';
export { otelTracer } from './otel';
export type { OtelSpanLike, OtelTracerLike } from './otel';
export { reportError, reportWarning, setOnError } from './errors';
export type { ErrorHandler, ErrorInfo, ErrorPhase } from './errors';
export { defaultPiiFilter, setPiiFilter } from './pii';
export type { PiiFilter } from './pii';
