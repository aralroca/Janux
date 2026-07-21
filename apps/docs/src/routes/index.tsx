import { Layout } from '../components/Layout';
import { DocsCopilot } from '../components/DocsCopilot';

export default function Home() {
  return (
    <Layout>
      <main>
        <h1>Janux</h1>
        <p class="tagline">
          The agent-native fullstack UI framework. One component, two faces: a live view for
          humans, typed MCP tools &amp; resources for AI agents — generated from the same
          definition.
        </p>
        <pre>
          <code>bunx create-janux my-app && cd my-app && bun install && bun run dev</code>
        </pre>
        <p>
          This documentation site is built with Janux itself: content pages are static
          components and the “Ask AI” copilot operates through the same agent bridge every
          Janux app gets for free. Configure its model with <code>JANUX_MODEL</code> or a
          provider API key — zero config otherwise.
        </p>
        <ul>
          <li>0 KB JavaScript on static pages</li>
          <li>Structural resumability: state snapshots, no hydration replay</li>
          <li>Every intent is an MCP tool; every component state is a resource</li>
          <li>Guards (auto / confirm / forbidden) as a language feature</li>
          <li>api() server functions that double as agent tools</li>
        </ul>
        <p>
          Start with <a href="/docs/getting-started">Getting started</a>.
        </p>
      </main>
      <DocsCopilot />
    </Layout>
  );
}
