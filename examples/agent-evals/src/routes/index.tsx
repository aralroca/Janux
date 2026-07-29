import { Stockroom } from '../components/Stockroom';

export const meta = {
  title: 'Warehouse — agent evals demo',
  description: 'A small inventory manager whose agent surface is gated in CI by janux eval.',
};

export default function Home() {
  return (
    <main class="page">
      <header class="masthead">
        <h1>Warehouse</h1>
        <p class="hint">
          Restocking is <code>auto</code>; writing stock off is <code>confirm</code> — an agent&apos;s write-off
          becomes a proposal a human approves. The scripted scenarios in <code>evals/</code> replay both flows
          through the agent surface alone, and <code>bunx janux eval</code> turns them into a CI gate.
        </p>
      </header>
      <Stockroom />
    </main>
  );
}
