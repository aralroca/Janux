import { component, int, intent, schema, str } from 'janux';

/**
 * An island whose only job is to prove the deployment works end to end: it is
 * server-rendered by Node, hydrated from the client bundle Node served, and its
 * intents run through the same invocation pipeline every other target uses.
 *
 * `runtime` and `version` are state rather than parameters because an island's
 * inputs *are* its state in Janux — schema-typed plain data, seeded from the
 * server with `initial` and serialized into the page for resumption.
 */
export const RuntimeCard = component({
  name: 'runtime-card',
  description: 'Shows which runtime served the page, and counts clicks to prove the island hydrated.',

  state: schema({
    runtime: str().default('unknown'),
    version: str().default(''),
    clicks: int().default(0),
  }),

  intents: {
    bump: intent({
      description: 'Increment the click counter.',
      run: ({ state }: any) => (state.clicks += 1),
    }),
    reset: intent({
      description: 'Set the click counter back to zero.',
      run: ({ state }: any) => (state.clicks = 0),
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="card">
      <p class="runtime">
        Served by <strong data-testid="runtime">{state.runtime}</strong> <span class="version">{state.version}</span>
      </p>

      <p class="counter">
        Clicks: <output data-testid="clicks">{state.clicks}</output>
      </p>

      <div class="actions">
        <button class="cta" data-testid="bump" onClick={intents.bump}>
          Click me
        </button>
        <button class="ghost" data-testid="reset" onClick={intents.reset}>
          Reset
        </button>
      </div>

      <p class="hint">
        If this number goes up without a page load, the island hydrated from the bundle Node served.
      </p>
    </section>
  ),
});
