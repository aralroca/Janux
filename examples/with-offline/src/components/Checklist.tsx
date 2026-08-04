import { bool, component, intent, list, obj, schema, str } from 'janux';

/**
 * The interactive half of the example, and the one that proves something the
 * content pages cannot: ticking a box offline means the client runtime and this
 * island's chunk were both answered from the cache. A page that renders offline
 * but cannot be used is only half a claim.
 */

const ITEMS = [
  'Water — 2 litres per person',
  'Map and compass (not the phone)',
  'Headtorch with spare cells',
  'Windproof shell',
  'First aid kit',
  'Whistle',
];

export const Checklist = component({
  name: 'checklist',
  description: 'Departure checklist for a day on the hill; each item can be ticked off.',

  state: schema({
    items: list(obj({ label: str(), packed: bool().default(false) })).default(
      ITEMS.map((label) => ({ label, packed: false })),
    ),
  }),

  intents: {
    toggle: intent({
      description: 'Tick or untick one item on the checklist',
      input: schema({ label: str() }),
      run: ({ state, input }: any) => {
        const item = state.items.find((candidate: any) => candidate.label === input.label);

        if (item) item.packed = !item.packed;
      },
    }),

    reset: intent({
      description: 'Untick everything and start the list again',
      run: ({ state }: any) => {
        state.items.forEach((item: any) => {
          item.packed = false;
        });
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="checklist">
      <ul>
        {state.items.map((item: any) => (
          <li key={item.label} class={item.packed ? 'packed' : ''}>
            <button
              type="button"
              data-item={item.label}
              aria-pressed={item.packed ? 'true' : 'false'}
              onClick={intents.toggle.with({ label: item.label })}
            >
              <span class="tick" aria-hidden="true">
                {item.packed ? '✓' : ''}
              </span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <p class="tally">
        <output data-packed={String(state.items.filter((item: any) => item.packed).length)}>
          {state.items.filter((item: any) => item.packed).length} of {state.items.length} packed
        </output>
        <button type="button" class="reset" onClick={intents.reset}>
          Reset
        </button>
      </p>
    </section>
  ),
});
