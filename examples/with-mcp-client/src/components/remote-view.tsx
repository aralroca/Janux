/**
 * The presentational half of the island. Two states carry the whole story:
 * connected (what the remote server offers, one click away) and not connected
 * (what happened and what to type next) — never a raw error dumped on a user.
 */

export interface RemoteToolRef {
  name: string;
  description: string;
}

export interface Discovery {
  available: boolean;
  url: string;
  demo: boolean;
  tools: RemoteToolRef[];
  error?: string;
  hint?: string;
  fix?: string;
}

const TONES = { wait: 'connecting…', ok: 'connected', down: 'not connected' };

function tone(discovery?: Discovery): keyof typeof TONES {
  if (!discovery) return 'wait';

  return discovery.available ? 'ok' : 'down';
}

export function head(discovery?: Discovery) {
  const state = tone(discovery);

  return (
    <div class="card-head">
      <h2>Remote MCP tools</h2>
      <span class={`pill ${state}`}>{TONES[state]}</span>
    </div>
  );
}

function target(discovery: Discovery) {
  return (
    <p class="target">
      <span class="badge">{discovery.demo ? 'built-in demo server' : 'MCP_SERVER_URL'}</span>
      <code>{discovery.url}</code>
    </p>
  );
}

function toolRow(tool: RemoteToolRef, invoke: any) {
  return (
    <li key={tool.name} class="tool">
      <div class="tool-text">
        <code>{tool.name}</code>
        <span class="desc">{tool.description}</span>
      </div>
      <button class="invoke" onClick={invoke.with({ name: tool.name })}>
        Invoke
      </button>
    </li>
  );
}

export function connected(discovery: Discovery, invoke: any) {
  return (
    <>
      {target(discovery)}
      <p class="count">
        {discovery.tools.length} tools discovered over <code>tools/list</code>, after the allowlist filter
      </p>
      <ul class="tools">{discovery.tools.map((tool) => toolRow(tool, invoke))}</ul>
    </>
  );
}

export function offline(discovery: Discovery) {
  return (
    <>
      {target(discovery)}
      <p class="hint">{discovery.hint}</p>
      {discovery.fix ? <pre class="fix">{discovery.fix}</pre> : null}
      <p class="degrade">
        The app itself is unaffected — pages, apis and the agent surface all still answer. Only this panel degrades.
      </p>
      <details class="raw">
        <summary>Connection error</summary>
        <code>{discovery.error}</code>
      </details>
    </>
  );
}
