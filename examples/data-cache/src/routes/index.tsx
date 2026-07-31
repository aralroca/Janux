import { Catalog } from '../components/Catalog';
import { CacheProbe } from '../components/CacheProbe';
import { AgentPanel } from '../components/AgentPanel';

export const meta = {
  title: 'Janux — data cache & URL state',
  description: 'A cached, filterable catalog whose filter lives in the URL.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Data cache + URL state</span>
        <span class="bar-hint">Filter is deep-linkable · the agent drives the same intent</span>
      </header>
      <main class="split">
        <section class="preview">
          <Catalog eager />
          <h2 class="probe-title">HTTP cache</h2>
          <p class="bar-hint">
            <a href="/catalog">/catalog</a> is public and tagged; <a href="/account">/account</a> declares nothing, so
            it is private.
          </p>
          <CacheProbe eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
