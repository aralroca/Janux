export const meta = { title: 'Pricing — Janux KB' };

const PLANS: [string, string, string][] = [
  ['Reader', 'Free', 'Browse the wiki and the whole docs tree.'],
  ['Editor', '9€', 'File tickets by number or uuid.'],
];

/** Served at /pricing: the `(marketing)` directory is organization, not URL. */
export default function PricingPage() {
  return (
    <section class="pricing">
      <header class="page-head">
        <p class="eyebrow">Route group</p>
        <h1>Pricing</h1>
        <p class="lead">
          Served at <code>/pricing</code> from <code>(marketing)/pricing.tsx</code> — the parentheses never reach the
          URL.
        </p>
      </header>
      <ul class="plans">
        {PLANS.map(([name, price, description]) => (
          <li class="plan" key={name}>
            <strong class="plan-name">{name}</strong>
            <span class="plan-price">{price}</span>
            <p class="plan-note">{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
