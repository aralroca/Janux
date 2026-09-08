import { Bench } from '../components/Bench';
import { Footer } from '../components/Footer';
import { Scoreboard } from '../components/Scoreboard';

export const meta = {
  title: 'Janux — store auto-wake',
  description: 'No eager islands: the first store write resumes every inert reader.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">✦ Store auto-wake</span>
        <Scoreboard />
      </header>
      <main class="pitch">
        <p class="hint">
          Nothing here is <code>eager</code>. Click a goal: the bench resumes, writes the store, and the
          write wakes the scoreboard — flipped conditional included.
        </p>
        <Bench />
      </main>
      <Footer />
    </div>
  );
}
