import { Notes } from '../components/Notes';

export const meta = {
  title: 'Janux + SQLite — notes',
  description: 'A notes CRUD persisted with bun:sqlite, served by api() RPC and classic REST handlers at once.',
};

export default function Home() {
  return (
    <main class="page">
      <header class="masthead">
        <h1>Notes</h1>
        <p class="hint">
          Persisted with <code>bun:sqlite</code> — the same database behind <code>api()</code> tools and the REST
          endpoints under <code>/api/notes</code>.
        </p>
      </header>
      <Notes eager />
    </main>
  );
}
