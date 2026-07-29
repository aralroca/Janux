import { safeAttr } from './html-escape';
import type { ApiTool } from './api';

/**
 * `janux dev` prints `/_janux/mcp`, so people click it — and an MCP endpoint
 * has nothing to say to a browser: GET is for server-initiated streams, which
 * a stateless server does not offer, so the honest answer is 405. That is a
 * blank error page for the one visitor who most needs the instructions.
 *
 * So GET answers by content type. MCP clients send
 * `Accept: application/json, text/event-stream` and still get the 405; a
 * browser asks for `text/html` and gets this: what the endpoint is, the
 * command that connects it, and the tools it serves.
 */

const STYLE = `
  :root { color-scheme: light dark; --bg: #fff; --fg: #111; --muted: #666; --line: #e5e5e5; --soft: #f6f6f6; --accent: #0062ff }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #212121; --fg: #ededed; --muted: #9a9a9a; --line: #3a3a3a; --soft: #1a1a1a; --accent: #47a8ff }
  }
  * { box-sizing: border-box }
  body { margin: 0; padding: 48px 24px; background: var(--bg); color: var(--fg);
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif }
  main { max-width: 680px; margin: 0 auto }
  h1 { margin: 0 0 6px; font-size: 22px }
  p { color: var(--muted) }
  h2 { margin: 32px 0 10px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted) }
  pre, code { font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace }
  pre { overflow-x: auto; margin: 0; padding: 14px 16px; border: 1px solid var(--line);
        border-radius: 10px; background: var(--soft); font-size: 13px }
  ul { margin: 0; padding: 0; list-style: none }
  li { padding: 10px 0; border-top: 1px solid var(--line) }
  /* Direct child only: the row's label. Code inside the description (405, a
     type name) is prose, and accent there reads as a link. */
  li > code { color: var(--accent); font-size: 13px }
  li span { display: block; color: var(--muted); font-size: 13.5px }
  footer { margin-top: 32px; color: var(--muted); font-size: 13px }
  a { color: var(--accent) }
`;

/** `Some App` → `some-app`, so the snippet is a command you can actually paste. */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-app';
}

/**
 * The thing a browser visitor gets wrong: that this URL stopped being JSON-RPC.
 * It did not — the method is what changes, not the protocol.
 */
const METHODS: [string, string][] = [
  [
    'POST',
    'The protocol. MCP over streamable HTTP: JSON-RPC 2.0 in, JSON-RPC 2.0 out. This is what an MCP client uses, and all it ever uses.',
  ],
  [
    'GET',
    'The spec reserves GET for server-initiated SSE streams. This server is stateless — a fresh logical server per request — so it has none to offer and answers <code>405</code>. Unless the request asks for HTML, which is how you got this page.',
  ],
];

function methodList(): string {
  const rows = METHODS.map(([method, note]) => `<li><code>${method}</code><span>${note}</span></li>`);

  return `<ul>${rows.join('')}</ul>`;
}

function toolList(tools: ApiTool[]): string {
  if (tools.length === 0) return '<p>No <code>api()</code> tools yet — every one you define shows up here.</p>';

  const rows = tools.map(
    (tool) =>
      `<li><code>${safeAttr(tool.name)}</code>${tool.description ? `<span>${safeAttr(tool.description)}</span>` : ''}</li>`,
  );

  return `<ul>${rows.join('')}</ul>`;
}

/**
 * The auth-aware half of the connect commands. The landing never sees the
 * real token (`McpAuth` only verifies), so the snippets ship a `$TOKEN`
 * placeholder the visitor fills in — nothing secret can leak into HTML.
 */
const AUTH_NOTE =
  '<p>This endpoint requires a bearer token — set <code>$TOKEN</code> to yours before pasting the commands below.</p>';

/** The page a browser gets when it opens the MCP endpoint. `auth` switches the commands to bearer mode. */
export function mcpLandingPage(serverName: string, endpoint: string, tools: ApiTool[], auth = false): string {
  const name = safeAttr(serverName);
  const url = safeAttr(endpoint);
  const count = tools.length === 1 ? '1 tool' : `${tools.length} tools`;
  const addHeader = auth ? ' \\\n  --header "Authorization: Bearer $TOKEN"' : '';
  const curlHeader = auth ? '\n  -H "Authorization: Bearer $TOKEN" \\' : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — MCP endpoint</title><style>${STYLE}</style></head>
<body><main>
<h1>${name} — MCP endpoint</h1>
<p>You opened this in a browser, so you get the explanation. An MCP client gets the protocol.</p>
<h2>How this URL answers</h2>
${methodList()}
<h2>Connect it</h2>
${auth ? AUTH_NOTE : ''}<pre>claude mcp add --transport http ${safeAttr(slug(serverName))} ${url}${addHeader}</pre>
<h2>Or see the protocol yourself</h2>
<pre>curl -s ${url} \\
  -H 'content-type: application/json' \\${curlHeader}
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</pre>
<h2>Tools (${count})</h2>
${toolList(tools)}
<footer>Generated from this app's <code>api()</code> functions — it cannot drift from the code that runs.
Pages are also served as MCP resources. Behaviour is identical in dev and in production.
<a href="/">Back to the app</a></footer>
</main></body></html>`;
}
