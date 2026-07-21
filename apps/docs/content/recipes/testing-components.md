# Testing components

Janux components test **without a browser**: `createInstance` gives you the full runtime — intents, guards, effects, sources, events — as plain function calls.

## The basics

```ts
import { describe, expect, it } from 'bun:test';
import { createInstance } from 'janux';
import { TaskBoard } from '../src/components/TaskBoard';

it('adds and toggles tasks', async () => {
  const board = createInstance(TaskBoard);

  await board.intents.add({ title: 'Ship v0.2' });
  await board.intents.toggle({ id: board.snapshot().tasks[0].id });
  expect(board.snapshot().tasks[0].done).toBe(true);
  expect(board.derived.remaining).toBe(0);
});
```

## Testing the agent face

The same pipeline a real agent hits — guards included:

```ts
it('clearDone needs human approval from agents', async () => {
  let proposal;
  const board = createInstance(TaskBoard, { onProposal: (p) => (proposal = p) });

  const result = await board.intents.clearDone({}, { origin: 'agent' });

  expect(result.status).toBe('proposal');          // nothing applied yet
  await proposal.execute();                         // the "human" approves
  expect(board.snapshot().tasks).toEqual([]);
});
```

Invalid input is a test too: `expect(board.intents.add({ title: '' })).rejects.toThrow(/below min/)`.

## Effects, sources and settled()

```ts
it('persists after the debounce', async () => {
  const board = createInstance(TaskBoard);

  await board.attach();                              // starts effects & sources
  await board.intents.add({ title: 'x' });
  await board.settled();                             // waits out the 400ms debounce
  // assert against your api mock here
  await board.dispose();
});
```

`attach()` is only needed when the test exercises effects, sources or lifecycle — pure intent tests can skip it.

## DOM-level tests (when you need them)

Use happy-dom's `GlobalRegistrator` with `renderToString` + `boot()` to test resume and delegation — see the framework's own `boot.test.ts` for the idiom. Most component logic never needs this level.

> **Tip:** if a behavior is hard to test without a browser, that's usually a smell — domain state living in the view instead of `state`.
