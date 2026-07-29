export const meta = { title: 'Pricing — Janux KB' };

const PLANS: [string, string][] = [
  ['Reader', 'Free — browse the wiki and the docs tree'],
  ['Editor', '9€ — file tickets by number or uuid'],
];

/** Served at /pricing: the `(marketing)` directory is organization, not URL. */
export default function PricingPage() {
  return (
    <section class="pricing">
      <h1>Pricing</h1>
      <ul>
        {PLANS.map(([name, description]) => (
          <li key={name}>
            <strong>{name}</strong> — {description}
          </li>
        ))}
      </ul>
    </section>
  );
}
