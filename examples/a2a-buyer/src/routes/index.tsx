import { OrderDesk } from '../components/OrderDesk';
import { supplierOrigin } from '../server/a2a-client';

export const meta = {
  title: 'Buyer — hiring another agent over A2A',
  description: 'A Janux app that discovers a supplier agent by its card and hires it, with a human on the guarded call.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">🛒 Buyer</span>
        <span class="bar-hint">Discovers the supplier by its agent card, then hires it over A2A</span>
      </header>
      <main>
        <OrderDesk eager />
        <section class="desk">
          <h2>What happens when you click</h2>
          <ol class="steps">
            <li>
              This app reads <code>{supplierOrigin()}/.well-known/agent-card.json</code> and uses the endpoint the card names.
            </li>
            <li>
              <b>Get a quote</b> calls <code>supplier.quote</code>, which is <code>auto</code>: a completed task comes
              straight back.
            </li>
            <li>
              <b>Ask them to ship</b> calls <code>supplier.ship</code>, which is <code>confirm</code>: the supplier
              answers <code>TASK_STATE_INPUT_REQUIRED</code> and nothing has run.
            </li>
            <li>A human at the supplier approves — on the supplier's own site, never here.</li>
            <li>
              <b>Refresh the task</b> reads <code>GetTask</code> and finally sees what shipped.
            </li>
          </ol>
          <p class="hint">
            The buyer never gets more authority by speaking A2A than it would over MCP or the HTTP bridge: the guard is
            enforced in the supplier's invocation pipeline, and every door leads to the same pipeline.
          </p>
        </section>
      </main>
    </div>
  );
}
