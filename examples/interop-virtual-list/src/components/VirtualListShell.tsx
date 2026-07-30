import { component, int, intent, schema } from 'janux';
import { foreign } from 'janux/interop';
import { VirtualList } from './VirtualList';

const COUNT = 10_000;

const List = foreign(VirtualList, {
  name: 'virtual-list',
  props: (own: any) => ({ count: own.state.count, selected: own.state.selected, scrollTo: own.state.scrollTo }),
  // A plain callback whose first argument IS the payload: the short form is
  // still the right one when it fits, and here it does.
  on: { onSelect: { intent: 'select', input: ({ args }: any) => ({ index: args[0] }) } },
});

/** The wrap-once pattern: TanStack Virtual renders the window; the selection lives in Janux. */
export const VirtualListShell = component({
  name: 'list',
  description: 'A 10,000-row virtualized list. The window is a foreign React island; the selection is Janux state.',
  state: schema({
    count: int().default(COUNT),
    selected: int().default(-1),
    // -1 means "no scroll requested". Writing an index asks the virtualizer to
    // jump there, which is how an agent moves a list it cannot scroll.
    scrollTo: int().default(-1),
  }),
  intents: {
    select: intent({
      description: 'Select one row by index',
      input: schema({ index: int().min(0).max(COUNT - 1).default(0) }),
      run: ({ state, input }: any) => (state.selected = input.index),
    }),
    scrollToRow: intent({
      description: 'Scroll the list so a row is at the top',
      input: schema({ index: int().min(0).max(COUNT - 1).default(5000) }),
      run: ({ state, input }: any) => (state.scrollTo = input.index),
    }),
    clear: intent({
      description: 'Clear the selection and scroll back to the top. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => {
        state.selected = -1;
        state.scrollTo = 0;
      },
    }),
  },
  view: ({ state }: any) => (
    <section class="list-shell">
      <p class="list-summary">
        {`${state.count.toLocaleString('en-US')} rows · `}
        {state.selected >= 0 ? `selected Row ${state.selected}` : 'nothing selected'}
      </p>
      <List state={state} />
    </section>
  ),
});
