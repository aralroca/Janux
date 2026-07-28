import { Nav } from '../components/Nav';
import { Counter, SlowNews, SlowStats } from '../components/Dashboard';

export const meta = {
  title: 'Janux — dashboard (slow on purpose)',
  description: 'Two islands with deliberate delays: skeletons stream first, content swaps in.',
};

export default function Dashboard() {
  return (
    <div class="app">
      <Nav active="/dashboard" />
      <main>
        <h1>Dashboard</h1>
        <p>Stats resolve in ~1.5s, news in ~2.5s — each swaps in on its own.</p>
        <SlowStats />
        <SlowNews />
        <Counter />
      </main>
    </div>
  );
}
