import { component, enums, intent, schema } from 'janux';

/**
 * Every knob is a CSS custom property. The island writes them onto one wrapper
 * and the cascade does the rest — no extra stylesheet, no rebuild, no class
 * explosion for the combinations.
 */

const BRANDS = { ocean: '#0062ff', moss: '#12805c', ember: '#d1442f', plum: '#7b3fbf' };
const DENSITIES = { cosy: '1.25rem', compact: '0.7rem' };
const CORNERS = { round: '1rem', sharp: '0.15rem' };

type Brand = keyof typeof BRANDS;
type Density = keyof typeof DENSITIES;
type Corner = keyof typeof CORNERS;

const brandNames = Object.keys(BRANDS) as Brand[];
const densityNames = Object.keys(DENSITIES) as Density[];
const cornerNames = Object.keys(CORNERS) as Corner[];

export const ThemeLab = component({
  name: 'theme-lab',
  description: 'Rethemes the page at runtime by writing CSS custom properties from island state.',

  state: schema({
    brand: enums(brandNames).default('ocean'),
    density: enums(densityNames).default('cosy'),
    corner: enums(cornerNames).default('round'),
  }),

  intents: {
    setBrand: intent({
      description: 'Change the accent colour.',
      input: schema({ brand: enums(brandNames) }),
      run: ({ state, input }: any) => (state.brand = input.brand),
    }),
    setDensity: intent({
      description: 'Change how much padding the surfaces get.',
      input: schema({ density: enums(densityNames) }),
      run: ({ state, input }: any) => (state.density = input.density),
    }),
    setCorner: intent({
      description: 'Change the corner radius.',
      input: schema({ corner: enums(cornerNames) }),
      run: ({ state, input }: any) => (state.corner = input.corner),
    }),
  },

  view: ({ state, intents }: any) => (
    <section
      class="theme"
      data-brand={state.brand}
      style={{
        '--brand': BRANDS[state.brand as Brand],
        '--pad': DENSITIES[state.density as Density],
        '--radius': CORNERS[state.corner as Corner],
      }}
    >
      <div class="knobs">
        <Knob label="brand" options={brandNames} active={state.brand} intent={intents.setBrand} name="brand" />
        <Knob label="density" options={densityNames} active={state.density} intent={intents.setDensity} name="density" />
        <Knob label="corners" options={cornerNames} active={state.corner} intent={intents.setCorner} name="corner" />
      </div>

      <article class="preview">
        <h2>Themed by the cascade</h2>
        <p>
          Three custom properties on one wrapper restyle everything below. The stylesheet never mentions
          &ldquo;{state.brand}&rdquo; — it only ever reads <code>var(--brand)</code>.
        </p>
        <button class="cta">Primary action</button>
      </article>
    </section>
  ),
});

/** One row of choices. Kept separate so the view stays readable at a glance. */
function Knob({ label, options, active, intent, name }: any) {
  return (
    <div class="knob">
      <span class="knob-label">{label}</span>
      {options.map((option: string) => (
        <button
          key={option}
          class={option === active ? 'chip active' : 'chip'}
          data-option={option}
          onClick={intent.with({ [name]: option })}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
