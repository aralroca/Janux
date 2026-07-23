import { bool, component, int, intent, schema, str } from 'janux';

/** Level 3: a leaf island with its own state. */
export const Badge = component({
  name: 'badge',
  description: 'A toggleable star badge.',
  state: schema({ on: bool() }),
  intents: {
    toggle: intent({ description: 'Toggle the badge', run: ({ state }) => (state.on = !state.on) }),
  },
  view: ({ state, intents }: any) => (
    <button class={`badge ${state.on ? 'badge-on' : ''}`} on={intents.toggle}>
      {state.on ? '★' : '☆'}
    </button>
  ),
});

/** Level 2: a stateful island that renders another stateful island. */
export const Card = component({
  name: 'card',
  description: 'A counter card holding a nested badge.',
  state: schema({ n: int() }),
  intents: {
    inc: intent({ description: 'Increment this card', run: ({ state }) => (state.n += 1) }),
  },
  view: ({ state, intents }: any) => (
    <div class="card">
      <output>{state.n}</output>
      <button on={intents.inc}>+1</button>
      <Badge />
    </div>
  ),
});

/** Level 1: controlled input + conditional nested islands. */
export const Board = component({
  name: 'board',
  description: 'A board of cards. Rename it, add and remove cards.',
  state: schema({ title: str().default('My board'), cards: int().default(2) }),
  intents: {
    rename: intent({
      description: 'Rename the board',
      input: schema({ value: str() }),
      run: ({ state, input }) => (state.title = input.value),
    }),
    add: intent({ description: 'Add a card', run: ({ state }) => (state.cards += 1) }),
    remove: intent({
      description: 'Remove the last card',
      run: ({ state }) => (state.cards = Math.max(0, state.cards - 1)),
    }),
  },
  view: ({ state, intents }: any) => (
    <section class="board">
      <input value={state.title} onInput={intents.rename} aria-label="Board title" />
      <h2>{state.title}</h2>
      <div class="row">
        <button on={intents.add}>+ card</button>
        <button on={intents.remove}>− card</button>
      </div>
      <div class="cards">
        {Array.from({ length: state.cards }, (_, index) => (
          <Card key={`c${index}`} />
        ))}
      </div>
    </section>
  ),
});
