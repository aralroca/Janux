import { Checklist } from '../components/Checklist';

export const meta = {
  title: 'Basecamp — an offline trail companion',
  description: 'A prerendered site with a service worker: the pages you have opened keep working with no network.',
};

export default function Home() {
  return (
    <>
      <h1>Basecamp</h1>
      <p class="lede">
        Signal goes first, and it goes on the days you need it most. Everything below was downloaded on your first
        visit and is answered from the cache after that — the app does not need the network to open.
      </p>

      <h2>Before you leave</h2>
      <Checklist />

      <h2>Try it</h2>
      <ol class="try">
        <li>Load this page once, and open <a href="/signals">Signals</a> so it is cached too.</li>
        <li>Turn the network off — devtools, airplane mode, unplug the cable.</li>
        <li>
          Reload. Both pages still render, the checklist still ticks, and a page you never opened lands on the{' '}
          <a href="/offline">offline notice</a> instead of a browser error.
        </li>
      </ol>
    </>
  );
}
