import { component, enums, int, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { SortableBoard } from './SortableBoard';

const CARDS = [
  { id: 'triage', label: 'Triage' },
  { id: 'build', label: 'Build' },
  { id: 'review', label: 'Review' },
  { id: 'ship', label: 'Ship' },
];

const IDS = CARDS.map((card) => card.id);

const Board = foreign(SortableBoard, {
  name: 'sortable-board',
  props: (own: any) => ({ cards: own.state.cards }),
  on: {
    /*
     * dnd-kit's drag event is the strongest case for the mapped `on:` form.
     * `args[0]` is a live object graph — `active` and `over` carry DOM rects,
     * measuring nodes and a native event — so forwarding it raw as an intent
     * input is not merely wrong, it is unserializable. What the intent wants is
     * two ids, and the drop index has to be read against the island's own list.
     */
    onDragEnd: {
      intent: 'move',
      input: ({ args, own }: any) => {
        const { active, over } = args[0] ?? {};
        const cards = own.state.cards;
        const to = cards.findIndex((card: any) => card.id === over?.id);

        // Dropped outside any target: land on the card's own position, which
        // the intent treats as a no-op rather than a validation error.
        return {
          id: String(active?.id),
          toIndex: to >= 0 ? to : cards.findIndex((card: any) => card.id === active?.id),
        };
      },
    },
  },
});

/** The wrap-once pattern: dnd-kit does the dragging, the order is Janux state. */
export const SortableBoardShell = component({
  name: 'board',
  description: 'A sortable board. The order lives in typed state; the dragging is a foreign dnd-kit island.',
  state: schema({ cards: list(obj({ id: str(), label: str() })).default(CARDS) }),
  intents: {
    move: intent({
      description: 'Move a card to a position (0-based)',
      // The same intent a drag produces — so an agent reorders the board
      // without dragging anything, and the audit trail cannot tell the two
      // apart except by who invoked it.
      // The default is the LAST position on purpose: the panel builds its
      // example payload from the schema, and `toIndex: 0` would generate a call
      // that moves the first card to where it already is — a green test that
      // proves nothing.
      input: schema({ id: enums(IDS), toIndex: int().min(0).max(IDS.length - 1).default(IDS.length - 1) }),
      run: ({ state, input }: any) => {
        const from = state.cards.findIndex((card: any) => card.id === input.id);

        if (from < 0 || from === input.toIndex) return;
        const next = state.cards.filter((card: any) => card.id !== input.id);

        next.splice(input.toIndex, 0, state.cards[from]);
        state.cards = next;
      },
    }),
    reset: intent({
      description: 'Restore the original order. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => (state.cards = CARDS),
    }),
  },
  view: ({ state }: any) => (
    <section class="board-shell">
      <p class="board-order">{state.cards.map((card: any) => card.id).join(' → ')}</p>
      <Board state={state} />
    </section>
  ),
});
