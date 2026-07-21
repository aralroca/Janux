import { describe, expect, it } from 'bun:test';
import { createInstance } from 'janux';
import { TaskBoard } from './TaskBoard';

describe('TaskBoard', () => {
  it('adds, toggles and counts tasks', async () => {
    const board = createInstance(TaskBoard);

    await board.intents.add!({ title: 'Ship it' });
    await board.intents.add!({ title: 'Write tests' });
    const [first] = board.snapshot().tasks as any[];

    await board.intents.toggle!({ id: first.id });
    expect((board.snapshot().tasks as any[])[0].done).toBe(true);
    expect(board.derived.remaining).toBe(1);
  });

  it('rejects empty titles', () => {
    const board = createInstance(TaskBoard);

    expect(board.intents.add!({ title: '' })).rejects.toThrow(/below min/);
  });

  it('clearDone is a proposal for agents — nothing happens until approval', async () => {
    let proposal: any;
    const board = createInstance(TaskBoard, { onProposal: (p) => (proposal = p) });

    await board.intents.add!({ title: 'done thing' });
    await board.intents.toggle!({ id: (board.snapshot().tasks as any[])[0].id });

    const result: any = await board.intents.clearDone!({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    expect(board.snapshot().tasks).toHaveLength(1);
    await proposal.execute();
    expect(board.snapshot().tasks).toHaveLength(0);
  });
});
