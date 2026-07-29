import { listIncidents, type Incident } from '../server/board';

export const meta = {
  title: 'Incident board — an MCP server by URL',
  description:
    'A Janux app whose /_janux/mcp endpoint is a bearer-protected MCP server: three api() tools, zero MCP code.',
};

const CONNECT_COMMAND = `claude mcp add --transport http incident-board \\
  http://localhost:4321/_janux/mcp \\
  --header "Authorization: Bearer demo-agent-token"`;

const CURL_COMMAND = `curl -s http://localhost:4321/_janux/mcp \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer demo-agent-token' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

function Row({ incident }: { incident: Incident }) {
  return (
    <tr>
      <td>#{incident.id}</td>
      <td>{incident.title}</td>
      <td>
        <span class={`badge ${incident.severity}`}>{incident.severity}</span>
      </td>
      <td>{incident.status}</td>
    </tr>
  );
}

function Board() {
  return (
    <table>
      <thead>
        <tr>
          <th>Id</th>
          <th>Incident</th>
          <th>Severity</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {listIncidents().map((incident) => (
          <Row key={incident.id} incident={incident} />
        ))}
      </tbody>
    </table>
  );
}

function Connect() {
  return (
    <section>
      <h2>Connect an MCP client</h2>
      <p>
        <code>POST /_janux/mcp</code> wants <code>Authorization: Bearer $AGENT_TOKEN</code> (demo default:{' '}
        <code>demo-agent-token</code>). Opening it in a browser stays public — the endpoint explains itself there.
      </p>
      <pre>{CONNECT_COMMAND}</pre>
      <h2>Or talk JSON-RPC yourself</h2>
      <pre>{CURL_COMMAND}</pre>
    </section>
  );
}

export default function Home() {
  return (
    <main class="page">
      <header class="masthead">
        <h1>Incident board</h1>
        <p class="hint">
          This page is for humans. Agents get the same app as an <strong>MCP server by URL</strong> at{' '}
          <a href="/_janux/mcp">/_janux/mcp</a> — <code>incidents.list</code> and <code>incidents.report</code> run
          unattended, <code>incidents.resolve</code> becomes a proposal a human approves.
        </p>
      </header>
      <Board />
      <Connect />
    </main>
  );
}
