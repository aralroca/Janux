import { afterEach, describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { obj, str } from '../schema';
import { recordingTracer } from '../observability/__fixtures__/recording-tracer';
import { setTracer } from '../observability/tracing';
import { createInstance } from './instance';
import type { Proposal } from './intents';

afterEach(() => setTracer(undefined));

const Cart = component({
  name: 'cart',
  state: obj({ last: str() }),
  intents: {
    checkout: intent({
      description: 'Place the order',
      guard: 'confirm',
      input: obj({ sku: str() }),
      run: ({ state, input }) => {
        state.last = (input as { sku: string }).sku;
      },
    }),
    browse: intent({ description: 'Look around', run: () => undefined }),
    explode: intent({ description: 'Always fails', run: () => { throw new Error('boom'); } }),
  },
  view: () => null,
});

describe('the invocation pipeline emits janux spans', () => {
  it('names the intent, its guard and who asked', async () => {
    const tracer = recordingTracer();
    const instance = createInstance(Cart);

    setTracer(tracer);
    await instance.intents.browse!();

    expect(tracer.spans).toMatchObject([
      {
        name: 'janux.intent',
        attributes: { 'janux.intent': 'cart.browse', 'janux.guard': 'auto', 'janux.origin': 'human' },
        ended: true,
      },
    ]);
  });

  it('marks an agent call as such', async () => {
    const tracer = recordingTracer();
    const instance = createInstance(Cart);

    setTracer(tracer);
    await instance.intents.browse!(undefined, { origin: 'agent' });

    expect(tracer.spans[0]!.attributes['janux.origin']).toBe('agent');
  });

  it('carries the proposal id when a confirm guard parks an agent call', async () => {
    const tracer = recordingTracer();
    const proposals: Proposal[] = [];
    const instance = createInstance(Cart, { onProposal: (proposal) => proposals.push(proposal) });

    setTracer(tracer);
    const result = (await instance.intents.checkout!({ sku: 'JX-1' }, { origin: 'agent' })) as { id: string };

    expect(tracer.spans[0]!.attributes).toMatchObject({
      'janux.intent': 'cart.checkout',
      'janux.guard': 'confirm',
      'janux.origin': 'agent',
      'janux.proposal.id': result.id,
    });
    expect(proposals[0]!.id).toBe(result.id);
  });

  it('opens a child span for the approved execution, linked to the same proposal', async () => {
    const tracer = recordingTracer();
    const proposals: Proposal[] = [];
    const instance = createInstance(Cart, { onProposal: (proposal) => proposals.push(proposal) });

    setTracer(tracer);
    await instance.intents.checkout!({ sku: 'JX-1' }, { origin: 'agent' });
    await proposals[0]!.execute();

    // The human approval is a second, separate act — and the trace says so.
    expect(tracer.names()).toEqual(['janux.intent', 'janux.intent.execute']);
    expect(tracer.spans[1]!.attributes).toMatchObject({
      'janux.intent': 'cart.checkout',
      'janux.origin': 'agent',
      'janux.proposal.id': proposals[0]!.id,
    });
    expect(instance.state.last).toBe('JX-1');
  });

  it('records the failure on the span and still rejects', async () => {
    const tracer = recordingTracer();
    const instance = createInstance(Cart);

    setTracer(tracer);
    await expect(instance.intents.explode!()).rejects.toThrow('boom');

    expect(String(tracer.spans[0]!.errors[0])).toContain('boom');
  });

  it('records a forbidden agent call as a failed span', async () => {
    const tracer = recordingTracer();
    const Locked = component({
      name: 'locked',
      intents: { wipe: intent({ description: 'Danger', guard: 'forbidden', run: () => undefined }) },
      view: () => null,
    });
    const instance = createInstance(Locked);

    setTracer(tracer);
    await expect(instance.intents.wipe!(undefined, { origin: 'agent' })).rejects.toThrow('not available');

    expect(tracer.spans[0]!.attributes['janux.guard']).toBe('forbidden');
    expect(tracer.spans[0]!.errors).toHaveLength(1);
  });

  it('costs nothing when no instrumentation is configured', async () => {
    const tracer = recordingTracer();
    const instance = createInstance(Cart);

    await instance.intents.browse!();

    expect(tracer.spans).toEqual([]);
  });
});
