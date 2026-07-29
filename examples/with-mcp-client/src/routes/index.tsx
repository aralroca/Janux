import { RemoteTools } from '../components/RemoteTools';

export const meta = {
  title: 'Janux — outbound MCP client',
  description: 'An app whose agent consumes a remote MCP server by URL, filters its tools and re-exposes them.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">🔌 Outbound MCP client</span>
        <span class="bar-hint">The tools below live on another server — discovered, filtered and invoked over MCP</span>
      </header>
      <main>
        <RemoteTools eager />
        <p class="swap">
          No setup: this process also starts a small demo MCP server on a loopback port and points the client at it, so
          the round trip above is a real one. Set <code>MCP_SERVER_URL</code> (and <code>MCP_SERVER_TOKEN</code> for a
          protected one) to talk to any other streamable-HTTP MCP server instead.
        </p>
      </main>
    </div>
  );
}
