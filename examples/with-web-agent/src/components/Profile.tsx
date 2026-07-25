import { component, intent, schema, str } from 'janux';

export const Profile = component({
  name: 'profile',
  description: 'Account profile. The display name is edited by hand — no tool changes it.',
  state: schema({ displayName: str().default('Aral Roca') }),
  intents: {
    /**
     * `forbidden` keeps this out of the manifest, so no tool can set the display
     * name: an agent has to read the page and fill the field like a human would.
     * That is the DOM fallback, and it lands on the same intent a keystroke does
     * — the value is island state, not a stray DOM write.
     */
    setDisplayName: intent({
      guard: 'forbidden',
      input: schema({ value: str() }),
      run: ({ state, input }: any) => (state.displayName = input.value),
    }),
  },
  view: ({ state, intents }: any) => (
    <div class="field">
      <label for="display-name">Display name</label>
      <input id="display-name" value={state.displayName} onInput={intents.setDisplayName} />
      <p class="hint">Nothing is exposed for this field — the agent falls back to the DOM.</p>
    </div>
  ),
});
