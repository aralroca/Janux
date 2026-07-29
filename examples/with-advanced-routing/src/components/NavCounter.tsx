import { component, int, intent, schema } from 'janux';

/**
 * Rendered `persist` from the root layout, so it is on every page: the live
 * instance and its DOM are lifted over each navigation's diff and grafted onto
 * the new page — the count survives while everything else is swapped.
 */
export const NavCounter = component({
  name: 'nav-counter',
  description: 'A counter in the shell that proves state survives SPA navigations.',
  state: schema({ clicks: int() }),
  intents: {
    add: intent({ description: 'Count a click', run: ({ state }) => (state.clicks += 1) }),
  },
  view: ({ state, intents }: any) => (
    <button class="nav-counter" onClick={intents.add} title="Island state — it survives every SPA navigation">
      <span class="nav-counter-dot" aria-hidden="true"></span>
      <span class="nav-counter-label">
        Clicked <span class="nav-counter-count">{state.clicks}×</span>
      </span>
    </button>
  ),
});
