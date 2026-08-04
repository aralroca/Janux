import { catalog, listShipments } from '../server/warehouse';

export const meta = {
  title: 'Supplier — a Janux app that is an agent',
  description: 'Three api() functions, published as an A2A agent card and an A2A endpoint with no integration code.',
};

const SEND = `curl -s http://localhost:4341/_janux/a2a \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{
        "role":"ROLE_USER","messageId":"m1",
        "parts":[{"data":{"skill":"supplier.quote","input":{"sku":"MUG","units":12}}}]}}}'`;

export default function Home() {
  const shipments = listShipments();

  return (
    <div class="app">
      <header class="bar">
        <span class="brand">📦 Supplier</span>
        <span class="bar-hint">An agent other agents can hire — over A2A, with a human on the shipping call</span>
      </header>
      <main>
        <section class="desk">
          <h2>Discover me</h2>
          <p class="hint">
            Everything an outside agent needs is derived from this app's <code>api()</code> functions: no card is written
            by hand here, so none can go stale.
          </p>
          <ul class="links">
            <li>
              <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a> — who I am, what I can do, what
              needs approval
            </li>
            <li>
              <a href="/_janux/a2a">/_janux/a2a</a> — the A2A endpoint (JSON-RPC)
            </li>
            <li>
              <a href="/_janux/mcp">/_janux/mcp</a> — the same tools over MCP
            </li>
          </ul>
        </section>

        <section class="desk">
          <h2>Hire me</h2>
          <pre>{SEND}</pre>
          <p class="hint">
            Ask for <code>supplier.ship</code> instead and the answer is a task in{' '}
            <code>TASK_STATE_INPUT_REQUIRED</code>: the guard parked it for a human here.
          </p>
        </section>

        <section class="desk">
          <h2>Stock</h2>
          <ul class="catalog">
            {catalog().map((item) => (
              <li key={item.sku}>
                <code>{item.sku}</code> {item.name} — {item.unitPrice}€ · {item.inStock} in stock
              </li>
            ))}
          </ul>
          <h2>Shipped</h2>
          {shipments.length === 0 ? (
            <p class="hint">Nothing has shipped. No approval, no shipment — that is the whole point.</p>
          ) : (
            <ol class="shipments">
              {shipments.map((shipment) => (
                <li key={shipment.id} class="shipment">
                  #{shipment.id} — {shipment.units} × <code>{shipment.sku}</code> <span class="at">{shipment.at}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
