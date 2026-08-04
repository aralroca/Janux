import { describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, schema } from '../schema';
import { createInstance } from './instance';

const runs: string[] = [];

const counter = component({
  name: 'diff-counter',
  state: schema({ n: int() }),
  intents: {
    reset: intent({ guard: 'confirm', run: ({ state }) => (state.n = 0) }),
    slow: intent({ guard: 'confirm', run: async ({ state }) => (state.n = -1) }),
    ship: intent({
      guard: 'confirm',
      run: ({ state }) => {
        runs.push('ship');

        return (state.n = 1);
      },
    }),
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

  it('is not computed for a host that shows none — the body must not run before approval', async () => {
    runs.length = 0;
    const instance = createInstance(counter, { initial: { n: 7 }, proposalDiff: false });
    const proposal: any = await instance.intents.ship!(undefined, { origin: 'agent' });

    expect(proposal.status).toBe('proposal');
    expect(proposal.diff).toBeUndefined();
    expect(runs).toEqual([]);
    expect((instance.state as any).n).toBe(7);
  });

  it('still runs the shadow for a host that does show one', async () => {
    runs.length = 0;
    const instance = createInstance(counter, { initial: { n: 7 } });
    const proposal: any = await instance.intents.ship!(undefined, { origin: 'agent' });

    expect(proposal.diff).toEqual({ before: { n: 7 }, after: { n: 1 } });
    expect(runs).toEqual(['ship']);
  });

  it('async intents refuse a diff rather than lie', async () => {
    const instance = createInstance(counter, { initial: { n: 7 } });
    const proposal: any = await instance.intents.slow!(undefined, { origin: 'agent' });

    expect(proposal.status).toBe('proposal');
    expect(proposal.diff).toBeUndefined();
    expect((instance.state as any).n).toBe(7);
  });
});
