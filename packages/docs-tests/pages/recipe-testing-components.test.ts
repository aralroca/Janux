import { describe, expect, it } from 'bun:test';
import { component, createInstance, effect, intent, jsx, schema, str } from 'janux';
import { TaskBoard, attachedBoard } from './__fixtures__/task-board';

/**
 * recipes/testing-components.md promises the whole runtime as plain function
 * calls. Each of its three snippets runs here against the tutorial's board,
 * including the two details a reader will copy verbatim: `board.derived`, and
 * the `/below min/` message an empty title produces.
 */

describe('recipes/testing-components.md', () => {
  it('the basics snippet: intents, snapshot and derived, with no attach()', async () => {
    const board = createInstance(TaskBoard);

    await board.intents.add({ title: 'Ship v0.2' });
    await board.intents.toggle({ id: (board.snapshot().tasks as any)[0].id });

    expect((board.snapshot().tasks as any)[0].done).toBe(true);
    expect(board.derived.remaining).toBe(0);
  });

  it('the agent-face snippet: a proposal, then a human approval', async () => {
    let proposal: any;
    const board = createInstance(TaskBoard, { onProposal: (received: any) => (proposal = received) } as any);

    await board.intents.add({ title: 'done thing' });
    await board.intents.toggle({ id: (board.snapshot().tasks as any)[0].id });
    const result: any = await board.intents.clearDone({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    await proposal.execute();

    expect(board.snapshot().tasks).toEqual([]);
  });

  it('invalid input rejects with the documented message', async () => {
    const board = createInstance(TaskBoard);

    await expect(board.intents.add({ title: '' })).rejects.toThrow(/below min/);
  });

  it('attach() + settled() wait out a debounced effect; dispose() stops it', async () => {
    const saves: string[][] = [];
    const Board = component({
      name: 'tasks-persisted',
      state: schema({ title: str().default('') }),
      intents: { add: intent({ input: schema({ title: str() }), run: ({ state, input }: any) => (state.title = input.title) }) },
      effects: {
        persist: effect({
          description: 'Saves tasks to the server after changes settle',
          when: (state: any) => state.title,
          debounce: '40ms',
          run: ({ state }: any) => {
            saves.push([state.title]);
          },
        }),
      },
      view: () => jsx('p', {}),
    });
    const board = await (async () => {
      const instance = createInstance(Board);

      await instance.attach();

      return instance;
    })();

    saves.length = 0;
    await board.intents.add({ title: 'a' });
    await board.intents.add({ title: 'b' });
    await board.settled();

    expect(saves).toEqual([['b']]); // rapid edits collapsed into one save
    await board.dispose();
  });

  it('a store-less board still exposes its agent surface through attach()', async () => {
    const board = await attachedBoard();

    // Without a `key`, an instance's uri has no fragment — SSR adds #default.
    expect(board.uri).toBe('ui://tasks');
    expect(Object.keys(board.intents).sort()).toEqual(['add', 'clearDone', 'toggle']);
  });
});
