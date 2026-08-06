import { afterEach, describe, expect, it } from 'bun:test';
import { registry } from '@aralroca/gui-agent';
import { createFrameTools, type FrameTools } from './frame-tools';

const COUNTER = {
  tools: [
    {
      name: 'counter.inc',
      description: 'Increment the counter',
      guard: 'auto',
      input: { type: 'object', properties: { by: { type: 'integer' } } },
    },
    { name: 'counter.reset', description: 'Reset to zero', guard: 'confirm' },
  ],
};
const CART = { tools: [{ name: 'cart.add', description: 'Add to the cart', guard: 'auto' }] };

let active: FrameTools | undefined;

afterEach(() => {
  active?.dispose();
  active = undefined;
});

/** A stand-in frame: records what the page posts to it, answers when the test says so. */
function frame(): { tools: FrameTools; sent: any[] } {
  const sent: any[] = [];

  active = createFrameTools((message) => sent.push(message));

  return { tools: active, sent };
}

/** What the model actually receives: gui-agent normalizes every result into an envelope. */
async function payload(result: unknown): Promise<any> {
  return JSON.parse((await (result as any)).content[0].text);
}

const names = (): string[] => registry.list().map((tool) => tool.name).filter((name) => name.startsWith('playground_'));

describe('playground frame tools', () => {
  it('exposes the frame manifest as tools of this page', () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });

    expect(names()).toEqual(['playground_counter_inc', 'playground_counter_reset']);
    expect(registry.get('playground_counter_inc')!.inputSchema).toEqual(COUNTER.tools[0]!.input as any);
  });

  it('says a confirm-guarded tool proposes rather than acts', () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });

    expect(registry.get('playground_counter_reset')!.description).toContain('approve');
    expect(registry.get('playground_counter_inc')!.description).not.toContain('approve');
  });

  it('routes a call into the frame and answers with the state it caused', async () => {
    const { tools, sent } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });
    const answer = registry.get('playground_counter_inc')!.execute({ by: 3 });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'call', tool: 'counter.inc', input: { by: 3 } });
    // The frame reports its new state before it answers, exactly as pg-frame does.
    tools.sync(COUNTER, { state: { count: 3 } });
    tools.settle(sent[0].id, 3);

    expect(await payload(answer)).toEqual({ result: 3, state: { count: 3 } });
  });

  it('ignores an answer to a call it is not waiting for', () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });

    // The agent panel's own buttons share this wire and mint their own ids.
    expect(() => tools.settle('some-other-call', 1)).not.toThrow();
  });

  it('swaps the whole surface when the reader loads another example', () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });
    tools.sync(CART, { state: { items: [] } });

    expect(names()).toEqual(['playground_cart_add']);
  });

  it('re-registers when the reader edits an intent schema without renaming it', () => {
    const { tools } = frame();
    const edited = {
      tools: [{ ...COUNTER.tools[0]!, input: { type: 'object', properties: { amount: { type: 'integer' } } } }],
    };

    tools.sync(COUNTER, { state: { count: 0 } });
    tools.sync(edited, { state: { count: 0 } });

    expect(registry.get('playground_counter_inc')!.inputSchema).toEqual(edited.tools[0]!.input as any);
  });

  it('keeps the surface across the state reports every call produces', () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });
    const first = registry.get('playground_counter_inc');

    tools.sync(COUNTER, { state: { count: 1 } });

    expect(registry.get('playground_counter_inc')).toBe(first!);
  });

  it('takes its tools off the page when the playground goes away', () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });
    tools.dispose();

    expect(names()).toEqual([]);
  });

  it('fails a call in flight when the playground goes away, instead of hanging it', async () => {
    const { tools } = frame();

    tools.sync(COUNTER, { state: { count: 0 } });
    const answer = registry.get('playground_counter_inc')!.execute({ by: 1 });

    tools.dispose();

    expect((await payload(answer)).error).toContain('went away');
  });
});
