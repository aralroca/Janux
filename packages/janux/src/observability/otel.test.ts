import { afterEach, describe, expect, it } from 'bun:test';
import { otelTracer, type OtelSpanLike, type OtelTracerLike } from './otel';
import { setTracer, withSpan } from './tracing';

afterEach(() => setTracer(undefined));

interface FakeSpan extends OtelSpanLike {
  attributes: Record<string, unknown>;
  exceptions: Error[];
  status?: { code: number; message?: string };
  ended: boolean;
}

/** A stand-in for `@opentelemetry/api`'s tracer, with the same startActiveSpan contract. */
function fakeOtel(): OtelTracerLike & { spans: FakeSpan[] } {
  const spans: FakeSpan[] = [];

  return {
    spans,
    startActiveSpan: (name, options, run) => {
      const span: FakeSpan = {
        attributes: { name, ...options.attributes },
        exceptions: [],
        ended: false,
        setAttributes: (extra) => Object.assign(span.attributes, extra),
        recordException: (error) => span.exceptions.push(error),
        setStatus: (status) => (span.status = status),
        end: () => (span.ended = true),
      };

      spans.push(span);

      return run(span);
    },
  };
}

describe('the OpenTelemetry adapter', () => {
  it('starts an active span carrying the janux attributes and ends it', async () => {
    const otel = fakeOtel();

    setTracer(otelTracer(otel));
    expect(await withSpan('janux.render', () => ({ 'janux.route': '/orders' }), async () => 'html')).toBe('html');

    expect(otel.spans[0]!.attributes).toMatchObject({ name: 'janux.render', 'janux.route': '/orders' });
    expect(otel.spans[0]!.ended).toBe(true);
  });

  it('drops attributes with no value — OTel rejects undefined', async () => {
    const otel = fakeOtel();

    setTracer(otelTracer(otel));
    await withSpan('janux.intent', () => ({ 'janux.guard': 'confirm', 'janux.proposal.id': undefined }), async () => undefined);

    expect('janux.proposal.id' in otel.spans[0]!.attributes).toBe(false);
  });

  it('records the exception, sets the error status and still ends the span', async () => {
    const otel = fakeOtel();
    const boom = new Error('boom');

    setTracer(otelTracer(otel));
    await expect(withSpan('janux.intent', () => ({}), async () => { throw boom; })).rejects.toThrow('boom');

    expect(otel.spans[0]!.exceptions).toEqual([boom]);
    expect(otel.spans[0]!.status).toEqual({ code: 2, message: 'Error: boom' });
    expect(otel.spans[0]!.ended).toBe(true);
  });

  it('records a non-Error throw as an exception too', async () => {
    const otel = fakeOtel();

    setTracer(otelTracer(otel));
    await expect(withSpan('janux.intent', () => ({}), async () => { throw 'forbidden'; })).rejects.toBe('forbidden');

    expect(otel.spans[0]!.exceptions[0]!.message).toBe('forbidden');
  });

  it('scrubs PII before it ever reaches the exporter', async () => {
    const otel = fakeOtel();

    setTracer(otelTracer(otel));
    await withSpan('janux.render', () => ({ 'janux.route': '/u/ada@example.com' }), async () => undefined);

    expect(otel.spans[0]!.attributes['janux.route']).toBe('/u/[email]');
  });
});
