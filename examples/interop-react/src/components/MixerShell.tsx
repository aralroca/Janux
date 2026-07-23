import { component, int, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { Mixer } from './Mixer';

const MixerIsland = foreign(Mixer, {
  name: 'mixer-canvas',
  props: (own: any) => ({ bands: own.state.bands }),
  on: { onBand: 'setBand' },
});

/** The wrap-once pattern (RFC §1.5): the React mixer renders this state; humans and agents share the intents. */
export const MixerShell = component({
  name: 'mixer',
  description: 'A three-band audio mixer. Bands live in typed state; the sliders are a foreign React island.',
  state: schema({
    bands: list(obj({ name: str(), level: int() })).default([
      { name: 'low', level: 5 },
      { name: 'mid', level: 5 },
      { name: 'high', level: 5 },
    ]),
  }),
  intents: {
    setBand: intent({
      description: 'Set one band level (0-10)',
      input: schema({ name: str(), level: int() }),
      run: ({ state, input }) => {
        const band = state.bands.find((candidate: any) => candidate.name === input.name);

        if (band) band.level = Math.max(0, Math.min(10, input.level));
      },
    }),
    flat: intent({
      description: 'Reset every band to 5. Needs human approval.',
      guard: 'confirm',
      run: ({ state }) => state.bands.forEach((band: any) => (band.level = 5)),
    }),
  },
  view: ({ state }: any) => (
    <section class="mixer-shell">
      <p class="levels">{state.bands.map((band: any) => `${band.name}=${band.level}`).join(' ')}</p>
      <MixerIsland state={state} />
    </section>
  ),
});
