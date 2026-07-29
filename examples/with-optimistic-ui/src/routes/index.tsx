import { Favorites } from '../components/Favorites';

export const meta = {
  title: 'Janux — optimistic UI',
  description: 'Starring a favorite lands instantly; a server rejection rolls it back.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⭐ Optimistic UI</span>
        <span class="bar-hint">Every 3rd save fails on purpose — watch the rollback</span>
      </header>
      <main>
        <Favorites eager />
      </main>
    </div>
  );
}
