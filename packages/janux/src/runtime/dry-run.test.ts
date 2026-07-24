import { describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, schema } from '../schema';
import { createInstance } from './instance';

const counter = component({
  name: 'diff-counter',
  state: schema({ n: int() }),
  intents: {
    reset: intent({ guard: 'confirm', run: ({ state }) => (state.n = 0) }),
    slow: intent({ guard: 'confirm', run: async ({ state }) => (state.n = -1) }),
  },
  view: ({ state }: any) => jsx('output', { children: state.n }),
});

describe('proposal visual diff (shadow dry-run)', () => {
  it('a confirm proposal carries before/after without touching real state', async () => {
    const instance = createInstance(counter, { initial: { n: 7 } });
    const proposal: any = await instance.intents.reset!(undefined, { origin: 'agent' });

    expect(proposal.status).toBe('proposal');
    expect(proposal.diff).toEqual({ before: { n: 7 }, after: { n: 0 } });
    expect((instance.state as any).n).toBe(7);
  });

  it('async intents refuse a diff rather than lie', async () => {
    const instance = createInstance(counter, { initial: { n: 7 } });
    const proposal: any = await instance.intents.slow!(undefined, { origin: 'agent' });

    expect(proposal.status).toBe('proposal');
    expect(proposal.diff).toBeUndefined();
    expect((instance.state as any).n).toBe(7);
  });
});
