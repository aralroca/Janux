import { component, enums, intent, list, schema, str } from 'janux';

const COLUMNS = ['Todo', 'In progress', 'Done'];

const CARDS = [
  { id: 'login', title: 'Fix login redirect', column: 'Todo' },
  { id: 'notes', title: 'Write release notes', column: 'Todo' },
  { id: 'dark', title: 'Dark mode for settings', column: 'In progress' },
  { id: 'sdk', title: 'Upgrade the SDK', column: 'Done' },
];

/**
 * A kanban moved with plain HTML5 drag and drop: `onDragStart` says which card
 * is in hand, `onDrop` makes each column a drop zone. The agent has no tool of
 * its own for it: it drags a card with the DOM fallback's `drag`, which fires
 * these same events, so the move lands on the same intents a mouse does — while
 * the pointer carries a copy of the card to its column.
 */
export const Board = component({
  name: 'board',
  description: 'A kanban board of cards in columns.',
  state: schema({
    dragging: str().default(''),
    cards: list({ id: str(), title: str(), column: enums(COLUMNS) }).default(CARDS),
  }),
  intents: {
    pick: intent({
      description: 'Pick up a card to drag it.',
      input: schema({ card: str() }),
      run: ({ state, input }: any) => (state.dragging = input.card),
    }),
    dropOn: intent({
      description: 'Drop the card in hand into a column.',
      input: schema({ column: enums(COLUMNS) }),
      run: ({ state, input }: any) => {
        const card = state.cards.find((item: any) => item.id === state.dragging);

        if (card) card.column = input.column;
        state.dragging = '';
      },
    }),
  },
  view: ({ state, intents }: any) => (
    <div class="board">
      {COLUMNS.map((column) => (
        <section
          key={column}
          class="column"
          aria-label={column}
          aria-dropeffect="move"
          onDrop={intents.dropOn.with({ column })}
        >
          <h3>{column}</h3>
          {state.cards
            .filter((card: any) => card.column === column)
            .map((card: any) => (
              <article key={card.id} class="card" draggable="true" onDragStart={intents.pick.with({ card: card.id })}>
                {card.title}
              </article>
            ))}
        </section>
      ))}
    </div>
  ),
});
