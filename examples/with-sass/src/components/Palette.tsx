import { component, enums, intent, schema } from 'janux';

/** The accent names `styles.scss` generates variant classes for, via `@each`. */
const ACCENTS = ['ocean', 'moss', 'ember', 'plum'] as const;

const BLURB: Record<string, string> = {
  ocean: 'The default: a calm, high-contrast blue.',
  moss: 'Quieter and greener, for reading-heavy screens.',
  ember: 'Warm and loud — good for destructive actions.',
  plum: 'Deep purple, the one that looks best in dark mode.',
};

export const Palette = component({
  name: 'palette',
  description: 'Switches the accent, exercising the variant classes Sass generated from a map.',

  state: schema({ accent: enums(ACCENTS).default('ocean') }),

  intents: {
    pick: intent({
      description: 'Choose the accent colour applied to the card.',
      input: schema({ accent: enums(ACCENTS) }),
      run: ({ state, input }: any) => {
        state.accent = input.accent;
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="palette">
      <div class="swatches">
        {ACCENTS.map((accent) => (
          <button
            key={accent}
            class={accent === state.accent ? `swatch accent-${accent}` : 'swatch'}
            data-accent={accent}
            onClick={intents.pick.with({ accent })}
          >
            {accent}
          </button>
        ))}
      </div>

      <article class={`card accent-${state.accent}`} data-active={state.accent}>
        <span class="chip">{state.accent}</span>
        <h2>Compiled, not configured</h2>
        <p>{BLURB[state.accent]}</p>
        <p class="count">
          {ACCENTS.length} variant classes came from one <code>@each</code> loop over a Sass map.
        </p>
      </article>
    </section>
  ),
});
