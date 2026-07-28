import { Nav } from '../components/Nav';
import { Counter } from '../components/Dashboard';

export const meta = {
  title: 'Janux — streaming suspense',
  description: 'Streaming SSR with suspense fallbacks and error boundaries.',
};

export default function Home() {
  return (
    <div class="app">
      <Nav active="/" />
      <main>
        <h1>Streaming suspense</h1>
        <p>
          Navigate to <strong>Dashboard</strong>: its slow islands stream a skeleton first and swap
          the real content in when their sources resolve — on first load and on SPA navigations,
          through the same streaming diff. <strong>Broken</strong> shows error boundaries.
        </p>
        <Counter />
      </main>
    </div>
  );
}
