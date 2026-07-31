import { afterEach, describe, expect, it } from 'bun:test';
import { schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import {
  defaultPiiFilter,
  isTracing,
  otelTracer,
  reportWarning,
  setOnError,
  setPiiFilter,
  setTracer,
  withSpan,
  type ErrorInfo,
  type JanuxTracer,
} from 'janux/observability';

/**
 * Every runnable claim on reference/observability-api.md: the tracer seam, the
 * OTel adapter, the error sink and the PII filter — run, not just compiled.
 */

afterEach(() => {
  setTracer(undefined);
  setOnError(undefined);
  setPiiFilter(undefined);
});

function collecting(): JanuxTracer & { seen: Array<{ name: string; attributes: Record<string, unknown> }> } {
  const seen: Array<{ name: string; attributes: Record<string, unknown> }> = [];

  return {
    seen,
    span: (name, attributes, run) => {
      const record = { name, attributes: { ...attributes } };

      seen.push(record);

      return run({
        setAttributes: (extra) => Object.assign(record.attributes, extra),
        recordError: () => undefined,
      });
    },
  };
}

describe('reference/observability-api.md — setTracer / isTracing / withSpan', () => {
  it('reports nothing until a tracer is registered', async () => {
    expect(isTracing()).toBe(false);
    expect(await withSpan('shop.import', () => ({ 'shop.rows': 3 }), async () => 'done')).toBe('done');
  });

  it('runs the documented api() example and carries both attribute sets', async () => {
    const tracer = collecting();
    const importOrders = api({
      description: 'Bulk import',
      input: schema({ rows: str() }),
      run: ({ input }) =>
        withSpan('shop.import', () => ({ 'shop.rows': (input as { rows: string }).rows.length }), async (span) => {
          span.setAttributes({ 'shop.skipped': 1 });

          return { ok: true };
        }),
    });

    setTracer(tracer);
    expect(isTracing()).toBe(true);
    expect(await importOrders({ rows: 'abc' })).toEqual({ ok: true });

    const own = tracer.seen.find((span) => span.name === 'shop.import')!;

    expect(own.attributes).toEqual({ 'shop.rows': 3, 'shop.skipped': 1 });
    // The app's span nests inside the pipeline's, as the reference claims.
    expect(tracer.seen[0]!.name).toBe('janux.api');
  });
});

describe('reference/observability-api.md — otelTracer', () => {
  it('maps a span onto startActiveSpan and ends it', async () => {
    const spans: Array<{ name: string; attributes: Record<string, unknown>; ended: boolean }> = [];

    setTracer(
      otelTracer({
        startActiveSpan: (name, options, run) => {
          const span = { name, attributes: { ...options.attributes }, ended: false };

          spans.push(span);

          return run({
            setAttributes: (extra) => Object.assign(span.attributes, extra),
            recordException: () => undefined,
            setStatus: () => undefined,
            end: () => (span.ended = true),
          });
        },
      }),
    );
    await withSpan('janux.render', () => ({ 'janux.route': '/orders/[id]' }), async () => undefined);

    expect(spans).toEqual([{ name: 'janux.render', attributes: { 'janux.route': '/orders/[id]' }, ended: true }]);
  });
});

describe('reference/observability-api.md — setOnError', () => {
  const failing = api({ description: 'Breaks', run: () => { throw new Error('gateway down'); } });
  const post = (name: string, headers: Record<string, string> = {}) =>
    createJanuxServer({ apis: { shop: { checkout: failing } } }).fetch(
      new Request(`http://x/_janux/api/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
        body: '{}',
      }),
    );

  it('hands the failure its phase, tool and origin', async () => {
    const seen: ErrorInfo[] = [];

    setOnError((_error, info) => seen.push(info));
    await post('shop.checkout', { 'x-janux-origin': 'agent' });

    expect(seen[0]).toMatchObject({ phase: 'invocation', intent: 'api.shop.checkout', origin: 'agent', level: 'error' });
  });

  it('separates a warning from a failure with info.level', () => {
    const seen: ErrorInfo[] = [];

    setOnError((_error, info) => seen.push(info));
    reportWarning('running with an in-memory queue', { phase: 'invocation' });

    expect(seen[0]!.level).toBe('warning');
  });

  it('contains a handler that throws — reporting is never a second failure', async () => {
    setOnError(() => {
      throw new Error('sink is down');
    });

    expect((await post('shop.checkout')).status).toBe(500);
  });
});

describe('reference/observability-api.md — setPiiFilter', () => {
  it('applies the documented default redactions', () => {
    expect(defaultPiiFilter('mail ada@example.com or call +34 600 123 456')).toBe('mail [email] or call [phone]');
    // Bare digit runs are signal, and stay.
    expect(defaultPiiFilter('order 600123456')).toBe('order 600123456');
  });

  it('composes on top of the default, exactly as the page shows', async () => {
    const tracer = collecting();

    setPiiFilter((value) => defaultPiiFilter(value).replace(/cus_\w+/g, '[customer]'));
    setTracer(tracer);
    await withSpan('shop.import', () => ({ 'shop.who': 'cus_9f2c for ada@example.com' }), async () => undefined);

    expect(tracer.seen[0]!.attributes['shop.who']).toBe('[customer] for [email]');
  });
});
