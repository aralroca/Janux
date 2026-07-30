import { afterEach, describe, expect, it, mock } from 'bun:test';
import { recordingTracer } from './__fixtures__/recording-tracer';
import { isTracing, setTracer, withSpan, type JanuxTracer } from './tracing';

afterEach(() => setTracer(undefined));

describe('the tracing seam', () => {
  it('runs the work and reports nothing when no tracer is registered', async () => {
    const attributes = mock(() => ({ 'janux.route': '/orders' }));

    expect(isTracing()).toBe(false);
    expect(await withSpan('janux.render', attributes, async () => 'html')).toBe('html');
    // The whole point of the off-state: not one attribute is built.
    expect(attributes).not.toHaveBeenCalled();
  });

  it('records a span with its attributes when a tracer is registered', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    expect(isTracing()).toBe(true);
    await withSpan('janux.render', () => ({ 'janux.route': '/orders' }), async () => 'html');

    expect(tracer.spans).toMatchObject([{ name: 'janux.render', attributes: { 'janux.route': '/orders' }, ended: true }]);
  });

  it('nests spans, so a trace has a shape', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await withSpan('janux.request', () => ({}), async () => {
      await withSpan('janux.render', () => ({}), async () => undefined);
    });

    expect(tracer.spans.map((span) => span.parent)).toEqual([-1, 0]);
  });

  it('lets the span carry attributes discovered while the work runs', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await withSpan('janux.intent', () => ({}), async (span) => span.setAttributes({ 'janux.proposal.id': 'prop_1' }));

    expect(tracer.spans[0]!.attributes).toEqual({ 'janux.proposal.id': 'prop_1' });
  });

  it('records the error and rethrows it when the work fails', async () => {
    const tracer = recordingTracer();
    const boom = new Error('boom');

    setTracer(tracer);
    await expect(withSpan('janux.intent', () => ({}), async () => { throw boom; })).rejects.toThrow('boom');
    expect(tracer.spans[0]!.errors).toEqual([boom]);
  });

  it('serves the request anyway when the tracer itself throws, running the work exactly once', async () => {
    const broken: JanuxTracer = { span: () => { throw new Error('exporter down'); } };
    const run = mock(async () => 'html');

    setTracer(broken);
    expect(await withSpan('janux.render', () => ({}), run)).toBe('html');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not turn a failing exporter into a failing request when the work already succeeded', async () => {
    const late: JanuxTracer = {
      span: async (_name, _attributes, run) => {
        await run({ setAttributes: () => undefined, recordError: () => undefined });

        throw new Error('flush failed');
      },
    };

    setTracer(late);
    expect(await withSpan('janux.render', () => ({}), async () => 'html')).toBe('html');
  });

  it('keeps the work failing when the exporter also fails — the app error is the one that matters', async () => {
    const late: JanuxTracer = {
      span: async (_name, _attributes, run) => {
        await run({ setAttributes: () => undefined, recordError: () => undefined }).catch(() => undefined);

        throw new Error('flush failed');
      },
    };

    setTracer(late);
    await expect(withSpan('janux.intent', () => ({}), async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('survives a span handle that throws on every call', async () => {
    const hostile: JanuxTracer = {
      span: (_name, _attributes, run) =>
        run({
          setAttributes: () => { throw new Error('nope'); },
          recordError: () => { throw new Error('nope'); },
        }),
    };

    setTracer(hostile);
    expect(await withSpan('janux.intent', () => ({}), async (span) => { span.setAttributes({ a: 1 }); return 'ok'; })).toBe('ok');
  });

  it('builds attributes lazily but only once', async () => {
    const tracer = recordingTracer();
    const attributes = mock(() => ({ 'janux.route': '/' }));

    setTracer(tracer);
    await withSpan('janux.render', attributes, async () => undefined);

    expect(attributes).toHaveBeenCalledTimes(1);
  });

  it('serves the request when building the attributes throws', async () => {
    setTracer(recordingTracer());

    expect(await withSpan('janux.render', () => { throw new Error('bad attrs'); }, async () => 'html')).toBe('html');
  });
});
