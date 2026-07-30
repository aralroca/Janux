import { PrimeLab } from '../components/PrimeLab';

export const meta = {
  title: 'Janux — work off the main thread with worker()',
  description: 'The same prime-counting function run on a Web Worker and on the main thread, side by side.',
};

export default function Home() {
  return (
    <main>
      <h1>
        <code>worker()</code>
      </h1>
      <p class="lede">
        One function, two threads. Run it on a worker and this ticker keeps counting; run it on the main thread
        and it stops dead until the work finishes.
      </p>

      {/* Outside the island on purpose: nothing the framework re-renders can move it. */}
      <p class="ticker-row">
        main thread ticks: <span id="ticker">0</span>
      </p>

      <PrimeLab />
    </main>
  );
}
