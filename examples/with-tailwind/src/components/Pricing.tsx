import { bool, component, intent, schema } from 'janux';

type Tier = {
  name: string;
  tagline: string;
  monthly: number;
  features: string[];
  featured: boolean;
};

export const TIERS: Tier[] = [
  {
    name: 'Starter',
    tagline: 'Side projects and experiments',
    monthly: 10,
    features: ['1 project', 'Community support', 'Weekly backups'],
    featured: false,
  },
  {
    name: 'Pro',
    tagline: 'Production apps with real traffic',
    monthly: 25,
    features: ['10 projects', 'Priority support', 'Daily backups', 'Custom domains'],
    featured: true,
  },
  {
    name: 'Scale',
    tagline: 'Teams shipping at full speed',
    monthly: 90,
    features: ['Unlimited projects', 'Dedicated support', 'Hourly backups', 'SSO & audit logs'],
    featured: false,
  },
];

/** Annual billing pays for ten months: two months free. */
export const price = (tier: Tier, annual: boolean) => (annual ? tier.monthly * 10 : tier.monthly);

export const period = (annual: boolean) => (annual ? '/yr' : '/mo');

const segmentClass = (active: boolean) =>
  active
    ? 'rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow'
    : 'rounded-full px-4 py-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400';

const cardClass = (featured: boolean) =>
  featured
    ? 'relative flex flex-col gap-4 rounded-2xl border-2 border-blue-600 bg-white p-6 shadow-xl dark:bg-slate-900'
    : 'relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900';

/** Static card (0 KB of its own JS): re-rendered by the island on toggle. */
function TierCard({ tier, annual }: { tier: Tier; annual: boolean }) {
  return (
    <article class={cardClass(tier.featured)} data-tier={tier.name}>
      {tier.featured ? (
        <span class="absolute -top-3 right-6 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-bold text-white">
          Most popular
        </span>
      ) : null}
      <h2 class="text-lg font-bold text-slate-900 dark:text-white">{tier.name}</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">{tier.tagline}</p>
      <p class="flex items-baseline gap-1">
        <span
          class="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white"
          data-price={String(price(tier, annual))}
        >
          €{price(tier, annual)}
        </span>
        <span class="text-sm text-slate-500 dark:text-slate-400">{period(annual)}</span>
      </p>
      <ul class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
        {tier.features.map((feature) => (
          <li key={feature}>✓ {feature}</li>
        ))}
      </ul>
      <button class="mt-auto rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 font-bold text-white shadow-lg">
        Choose {tier.name}
      </button>
    </article>
  );
}

/** The only island on the page: the toggle re-renders all three cards. */
export const PricingTable = component({
  name: 'pricing-table',
  description: 'Three pricing tiers with a monthly/annual billing toggle.',
  state: schema({ annual: bool() }),
  intents: {
    monthly: intent({ description: 'Bill monthly', run: ({ state }) => (state.annual = false) }),
    annual: intent({
      description: 'Bill annually — two months free',
      run: ({ state }) => (state.annual = true),
    }),
  },
  view: ({ state, intents }) => (
    <section class="flex w-full flex-col items-center gap-10">
      <div class="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
        <button onClick={intents.monthly} class={segmentClass(!state.annual)}>
          Monthly
        </button>
        <button onClick={intents.annual} class={segmentClass(state.annual)}>
          Annual
        </button>
      </div>
      <div class="grid w-full max-w-5xl gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <TierCard tier={tier} annual={state.annual} key={tier.name} />
        ))}
      </div>
    </section>
  ),
});
