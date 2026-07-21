import { Counter } from '../components/Counter';

export default function Home() {
  return (
    <main>
      <h1>Welcome to Janux</h1>
      <p>This heading is static HTML (0 KB JS). The counter below is a resumable island.</p>
      <Counter />
      <p>
        Try the agent surface: <code>curl localhost:3000/_janux/manifest</code>
      </p>
    </main>
  );
}
