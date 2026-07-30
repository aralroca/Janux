import { AgentPanel } from '../components/AgentPanel';
import { RevenueChartShell } from '../components/RevenueChartShell';

export const meta = {
  title: 'Janux — React charts interop',
  description: 'Recharts mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Charts interop</span>
        <span class="bar-hint">The chart is recharts · the data and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <RevenueChartShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
