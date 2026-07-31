import { Catalog } from '../components/Catalog';
import { CacheProbe } from '../components/CacheProbe';
import { AgentPanel } from '../components/AgentPanel';

export const meta = {
  title: 'Janux — data cache & URL state',
  description: 'A cached, filterable catalog whose filter lives in the URL, and the HTTP cache policy behind it.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Data cache + HTTP cache</span>
        <span class="bar-hint">One caching model, from the CDN down to the island</span>
      </header>
      <main class="split">
        <section class="preview">
          <div class="intro">
            <h1>What this example shows</h1>
            <p>
              A product catalog you can filter, wired end to end through Janux's caching model — the same three
              words (<code>fresh</code>, <code>stale</code>, <code>expired</code>) on every layer.
            </p>
            <ol>
              <li>
                <b>Client cache.</b> <code>useQuery</code> is keyed by the active tag, so switching filters switches
                cache entries — instant when cached, fetched when not.
              </li>
              <li>
                <b>URL state.</b> The filter lives in <code>?tag=</code>, so it is deep-linkable and the Back button
                undoes it. The page never re-renders; only the island reacts.
              </li>
              <li>
                <b>No double fetch.</b> The products below were fetched once, on the server, and travelled inside the
                HTML. Open DevTools and reload: mounting costs zero requests.
              </li>
              <li>
                <b>HTTP cache.</b> <a href="/catalog">/catalog</a> declares itself public and tagged, so a CDN may
                keep it; <a href="/account">/account</a> declares nothing and is therefore <code>private,
                no-store</code>.
              </li>
              <li>
                <b>Agent parity.</b> The panel on the right drives the very same intent your clicks do.
              </li>
            </ol>
          </div>
          <Catalog eager />
          <h2 class="probe-title">Cache headers, live</h2>
          <CacheProbe eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
