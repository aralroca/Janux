import { INVOICES } from '../server/billing.api';
import { KNOWLEDGE_BASE } from '../server/support.api';

export const meta = {
  title: 'Janux — subagents & handoffs',
  description: 'One agent config composing a front desk, a budgeted research subagent and a billing handoff target.',
};

const DELEGATION_CURL = `curl -X POST localhost:4343/_janux/agent \\
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' \\
  -d '{"messages":[{"role":"user","content":"what is an island?"}]}'`;

const HANDOFF_CURL = `curl -X POST localhost:4343/_janux/agent \\
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' \\
  -d '{"messages":[{"role":"user","content":"refund order A-1002"}]}'

# The reply carries "agent":"billing" — echo it back to keep talking to billing:
curl -X POST localhost:4343/_janux/agent \\
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' \\
  -d '{"agent":"billing","messages":[{"role":"user","content":"and my invoice?"}]}'`;

const PRE_STYLE = { background: '#f4f4f5', padding: '0.75rem 1rem', borderRadius: '8px', overflowX: 'auto', fontSize: '0.85rem' } as const;

export default function Home() {
  return (
    <main style={{ maxWidth: '46rem', margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif', lineHeight: '1.6' }}>
      <h1>🤝 Subagents &amp; handoffs</h1>
      <p>
        This example shows <strong>agent composition</strong>: one <code>defineAgent</code> config (
        <code>src/agent.ts</code>) that behaves as three agents. This page is only the demo's dashboard — it shows the
        data those agents work with, so you can check their answers against the source.
      </p>

      <h2>Where is the copilot?</h2>
      <p>
        There is <strong>no chat widget on this page</strong>. The agent is the HTTP endpoint this app serves at{' '}
        <code>POST /_janux/agent</code> — every delegation and handoff below happens server-side inside that endpoint.
        You talk to it from a terminal (or any client) as shown in “Try it”.
      </p>

      <h2>The three agents in one config</h2>
      <ul>
        <li>
          <strong>Front desk</strong> — the root agent. It answers product questions and routes everything else. It
          excludes <code>api.admin.*</code> from its tools.
        </li>
        <li>
          <strong><code>research</code> (subagent)</strong> — declared under <code>subagents:</code>, which gives the
          front desk's model a <code>delegate.research</code> tool. Calling it runs a <em>second, nested loop</em> on the
          server: its own system prompt, fresh history (the task string is all the context it gets), only{' '}
          <code>api.support.*</code>, and a <strong>mandatory budget</strong> (<code>maxTurns</code>,{' '}
          <code>maxTokens</code>, <code>maxMs</code>). Its report comes back to the front desk as a tool result.
        </li>
        <li>
          <strong><code>billing</code> (handoff)</strong> — declared under <code>handoffs:</code>, which gives the model
          a <code>handoff.billing</code> tool. Calling it <em>transfers the conversation</em>: billing's prompt and{' '}
          <code>api.billing.*</code> tools take over and it answers you from then on. The reply carries{' '}
          <code>"agent": "billing"</code>, which the client echoes back (like <code>threadId</code>) so later turns keep
          talking to billing.
        </li>
      </ul>

      <h2>Try it</h2>
      <p>
        Start the app with a model key (<code>ANTHROPIC_API_KEY=sk-... bun dev</code>, or any provider via{' '}
        <code>JANUX_MODEL</code>). A lookup question makes the front desk <em>delegate</em>:
      </p>
      <pre style={PRE_STYLE}>{DELEGATION_CURL}</pre>
      <p>A money question makes it <em>hand off</em> — note the sticky <code>agent</code> field on the second call:</p>
      <pre style={PRE_STYLE}>{HANDOFF_CURL}</pre>

      <h2>Why a subagent is not an escalation</h2>
      <p>
        A subagent's tools are the <strong>intersection</strong> of its filter with its parent's. The front desk
        excludes <code>api.admin.*</code>, so <code>research</code> can never reach <code>admin.purge</code> — not
        advertised to it, and refused with <code>tool_forbidden</code> if its model calls it anyway. This example's e2e
        suite (<code>e2e/with-subagents.e2e.test.ts</code>) proves it against the real endpoint.
      </p>

      <h2>Knowledge base (what research sees)</h2>
      <p>The only data <code>api.support.search</code> can return — so you can verify a delegated answer came from here.</p>
      <ul>
        {KNOWLEDGE_BASE.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.topic}</strong> — {entry.body} <small>({entry.id})</small>
          </li>
        ))}
      </ul>

      <h2>Invoices (what billing sees)</h2>
      <p>The demo ledger behind <code>api.billing.*</code> — a refund flips the status here (in memory).</p>
      <ul>
        {[...INVOICES.values()].map((entry) => (
          <li key={entry.order}>
            <code>{entry.order}</code> — ${entry.amountUsd} — {entry.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
