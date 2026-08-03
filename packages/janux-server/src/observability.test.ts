import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { api } from './api';
import { createJanuxServer } from './server';
import { obj, str } from 'janux';
import { recordingTracer } from '../../janux/src/observability/__fixtures__/recording-tracer';
import { setOnError, setTracer, type ErrorInfo } from 'janux/observability';

const APP = `${import.meta.dirname}/__fixtures__/observability`;

const shop = {
  checkout: api({
    description: 'Place the order',
    guard: 'confirm',
    input: obj({ sku: str() }),
    run: ({ input }) => ({ ordered: (input as { sku: string }).sku }),
  }),
  crash: api({ description: 'Always fails', run: () => { throw new Error('warehouse offline'); } }),
};

const server = createJanuxServer({ routesDir: APP, apis: { shop } });

const get = (path: string) => server.fetch(new Request(`http://localhost${path}`));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  server.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    }),
  );

const agent = { 'x-janux-origin': 'agent' };

afterEach(() => {
  setTracer(undefined);
  setOnError(undefined);
});

describe('serving a page emits the request/render/island spans', () => {
  it('names the request, the route it resolved and the method', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await (await get('/')).text();

    expect(tracer.spans[0]).toMatchObject({
      name: 'janux.request',
      attributes: { 'janux.route': '/', 'http.request.method': 'GET' },
      parent: -1,
    });
  });

  it('reports the route PATTERN, not the URL — a span per order id is not a route', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await (await get('/orders/42')).text();

    expect(tracer.spans[0]!.attributes['janux.route']).toBe('/orders/[id]');
  });

  it('nests the SSR render inside the request', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await (await get('/')).text();

    const render = tracer.spans.find((span) => span.name === 'janux.render')!;

    expect(render.attributes['janux.route']).toBe('/');
    expect(tracer.spans[render.parent]!.name).toBe('janux.request');
  });

  it('names every island it rendered', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await (await get('/')).text();

    const island = tracer.spans.find((span) => span.name === 'janux.island')!;

    expect(island.attributes['janux.island']).toBe('cart');
    expect(tracer.spans[island.parent]!.name).toBe('janux.render');
  });
});

describe('the api() invocation pipeline is traced end to end', () => {
  it('carries the tool, the guard and who asked', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await post('/_janux/api/shop.checkout', { sku: 'JX-1' }, agent);

    const call = tracer.spans.find((span) => span.name === 'janux.api')!;

    expect(call.attributes).toMatchObject({
      'janux.intent': 'api.shop.checkout',
      'janux.guard': 'confirm',
      'janux.origin': 'agent',
    });
    expect(call.attributes['janux.proposal.id']).toMatch(/^prop_api_/);
  });

  it('traces a human call as human, with no proposal', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await post('/_janux/api/shop.checkout', { sku: 'JX-1' });

    const call = tracer.spans.find((span) => span.name === 'janux.api')!;

    expect(call.attributes['janux.origin']).toBe('human');
    expect(call.attributes['janux.proposal.id']).toBeUndefined();
  });

  it('records the failure on the span when the tool throws', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await post('/_janux/api/shop.crash', {});

    expect(tracer.spans.find((span) => span.name === 'janux.api')!.errors).toHaveLength(1);
  });
});

/**
 * The acceptance trace: one agent, one guarded tool, one human saying yes. It
 * is the whole argument for this feature — no other framework can emit it,
 * because no other framework knows which guard decided or who was asking.
 */
describe('the agentic round trip reads as one story', () => {
  it('goes request → render → island, then proposal, approval and execution', async () => {
    const tracer = recordingTracer();

    setTracer(tracer);
    await (await get('/')).text();
    const proposed = await (await post('/_janux/api/shop.checkout', { sku: 'JX-1' }, agent)).json();
    const { id } = proposed.result;
    // Spans carry the bare id: the signed token is a capability, and a trace
    // that contained it would let anyone reading logs approve the proposal.
    const [bareId] = id.split('.');
    const approved = await (await post('/_janux/approve', { id })).json();

    expect(approved.result).toEqual({ ordered: 'JX-1' });
    expect(tracer.names()).toEqual([
      'janux.request',
      'janux.render',
      'janux.island',
      'janux.request',
      'janux.api',
      'janux.request',
      'janux.proposal.approve',
      'janux.api.execute',
    ]);

    const [, , , , proposal, , approval, execution] = tracer.spans;

    expect(proposal!.attributes).toMatchObject({ 'janux.guard': 'confirm', 'janux.origin': 'agent', 'janux.proposal.id': bareId });
    expect(approval!.attributes).toMatchObject({ 'janux.proposal.id': bareId, 'janux.origin': 'human' });
    // The approval is human; the execution still ran on the agent's behalf.
    expect(execution!.attributes).toMatchObject({ 'janux.origin': 'agent', 'janux.proposal.id': bareId });
    expect(tracer.spans[execution!.parent]!.name).toBe('janux.proposal.approve');
  });
});

describe('the global onError sees what no page can catch', () => {
  it('reports an SSR failure with its phase and route, and still serves _500', async () => {
    const onError = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);

    setOnError(onError);
    const response = await get('/boom');

    await response.text();
    expect(response.status).toBe(500);
    expect(String(onError.mock.calls[0]![0])).toContain('page exploded');
    expect(onError.mock.calls[0]![1]).toMatchObject({ phase: 'ssr', route: '/boom', level: 'error' });
  });

  it('reports a failure in the invocation pipeline with the tool and the origin', async () => {
    const onError = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);

    setOnError(onError);
    await post('/_janux/api/shop.crash', {}, agent);

    expect(onError.mock.calls[0]![1]).toMatchObject({
      phase: 'invocation',
      intent: 'api.shop.crash',
      origin: 'agent',
      level: 'error',
    });
  });

  it('does not fire for an expected refusal — bad input is a client error, not an incident', async () => {
    const onError = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);

    setOnError(onError);
    await post('/_janux/api/shop.checkout', { sku: 42 }, agent);

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('an uninstrumented app pays nothing, and a broken exporter changes nothing', () => {
  it('emits no spans at all when no tracer is registered', async () => {
    const tracer = recordingTracer();

    await (await get('/')).text();
    await post('/_janux/api/shop.checkout', { sku: 'JX-1' });

    expect(tracer.spans).toEqual([]);
  });

  it('serves the page anyway when the tracer throws on every span', async () => {
    const warned = spyOn(console, 'warn').mockImplementation(() => undefined);

    setTracer({ span: () => { throw new Error('exporter down'); } });
    const response = await get('/');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<main>');
    warned.mockRestore();
  });
});
