import { Nav } from '../components/Nav';
import { Counter } from '../components/Dashboard';
import { BubbleShell, FailingCard } from '../components/Broken';

export const meta = {
  title: 'Janux — error boundaries',
  description: 'Islands that throw during SSR, contained by error views.',
};

export default function Broken() {
  return (
    <div class="app">
      <Nav active="/broken" />
      <main>
        <h1>Error boundaries</h1>
        <p>Both islands below throw during SSR. The rest of the page keeps working.</p>
        <FailingCard />
        <BubbleShell />
        <Counter />
      </main>
    </div>
  );
}
