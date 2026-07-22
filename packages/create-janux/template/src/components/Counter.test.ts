import { describe, expect, it } from 'bun:test';
import { createInstance } from 'janux';
import { Counter } from './Counter';

describe('Counter', () => {
  it('increments and decrements', async () => {
    const counter = createInstance(Counter);

    await counter.intents.inc!({});
    await counter.intents.inc!({ by: 4 });
    await counter.intents.dec!({});
    expect(counter.snapshot().count).toBe(4);
  });

  it('reset is a proposal for agents — nothing happens until approval', async () => {
    let proposal: any;
    const counter = createInstance(Counter, { onProposal: (p) => (proposal = p) });

    await counter.intents.inc!({ by: 3 });
    const result: any = await counter.intents.reset!({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    expect(counter.snapshot().count).toBe(3);
    await proposal.execute();
    expect(counter.snapshot().count).toBe(0);
  });
});
