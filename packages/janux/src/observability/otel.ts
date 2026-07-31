import type { AttributeValue, JanuxSpan, JanuxTracer, SpanAttributes } from './tracing';

/**
 * The bridge to any OpenTelemetry backend — Sentry, Datadog, an OTLP collector
 * — described structurally rather than imported. `@opentelemetry/api` stays out
 * of the framework's dependency tree: an app that never registers a tracer must
 * not pay for an SDK it does not use, and one that does already has the real
 * package installed for its exporter.
 */
export interface OtelSpanLike {
  setAttributes(attributes: Record<string, AttributeValue>): unknown;
  recordException(error: Error): unknown;
  setStatus(status: { code: number; message?: string }): unknown;
  end(): unknown;
}

export interface OtelTracerLike {
  startActiveSpan<T>(
    name: string,
    options: { attributes: Record<string, AttributeValue> },
    run: (span: OtelSpanLike) => T,
  ): T;
}

/** `SpanStatusCode.ERROR`, inlined so the adapter needs no import. */
const STATUS_ERROR = 2;

/** OTel rejects `undefined` attribute values; an attribute we could not resolve simply does not travel. */
function defined(attributes: SpanAttributes): Record<string, AttributeValue> {
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined);

  return Object.fromEntries(entries) as Record<string, AttributeValue>;
}

function bridge(span: OtelSpanLike): JanuxSpan {
  return {
    setAttributes: (attributes) => span.setAttributes(defined(attributes)),
    recordError: (error) => {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: STATUS_ERROR, message: String(error) });
    },
  };
}

/**
 * Wraps an OpenTelemetry tracer as a Janux tracer:
 *
 * ```ts
 * import { trace } from '@opentelemetry/api';
 * setTracer(otelTracer(trace.getTracer('janux')));
 * ```
 *
 * `startActiveSpan` is what gives the trace its shape — the SSR render, the
 * intent it triggered and the model turn inside it become parent and children
 * because OTel's context propagation, not Janux, tracks who is active.
 */
export function otelTracer(tracer: OtelTracerLike): JanuxTracer {
  return {
    span: (name, attributes, run) =>
      tracer.startActiveSpan(name, { attributes: defined(attributes) }, async (span) => {
        try {
          return await run(bridge(span));
        } finally {
          span.end();
        }
      }),
  };
}
