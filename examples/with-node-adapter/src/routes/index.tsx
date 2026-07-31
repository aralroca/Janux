import { RuntimeCard } from '../components/RuntimeCard';
import { runtimeInfo } from '../server/runtime.api';

export const meta = {
  title: 'Janux — deployed on Node with @janux/node',
  description: 'The same app, served by Node instead of Bun: one adapter, one bundle, no Bun in production.',
};

export default function Home() {
  const { runtime, version } = runtimeInfo();

  return (
    <main>
      <h1>Running on {runtime}</h1>

      <p class="lede">
        This page was server-rendered by the runtime named above. Nothing in <code>src/</code> knows which one
        it is — <code>@janux/node</code> is a build-time choice, and the app is the same either way.
      </p>

      <RuntimeCard initial={{ runtime, version }} />

      <h2>Two commands, two runtimes</h2>
      <pre class="commands">
        <code>
          bun run build &amp;&amp; bun run start{'\n'}
          bun run build:node &amp;&amp; node build/index.js
        </code>
      </pre>

      <p class="note">
        The second one produces <code>build/</code> — a bundle, the client assets and the app&rsquo;s source
        tree. Copy that directory to any box with Node 24+ and it serves. There is no install step, because
        there is nothing left to resolve.
      </p>
    </main>
  );
}
