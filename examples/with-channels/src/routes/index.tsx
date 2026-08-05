import { IncidentBoard } from '../components/IncidentBoard';

export const meta = {
  title: 'On-call desk — channels demo',
  description: 'One agent answering both in the browser and over an HTTP webhook, with the same guards.',
};

export default function Home() {
  return (
    <main class="page">
      <header class="masthead">
        <h1>On-call desk</h1>
        <p class="hint">
          The same agent lives behind two doors. In the browser it can read the board, acknowledge an incident and{' '}
          <code>focus</code> one on this page. Over <code>src/channels/webhook.ts</code> it can still read and
          acknowledge — but there is no page to focus, so it is told that by name instead of calling into the void.
        </p>
        <p class="hint">
          Paging an engineer is guarded with <code>confirm</code> on both doors: the agent gets a proposal a human
          approves, never a page it sent itself.
        </p>
        <h2>Try it</h2>
        <p class="hint">
          Put your own key in place of <code>sk-or-…</code> and run it from this folder:
        </p>
        <pre class="try">
          <code>
            export JANUX_WEBHOOK_SECRET=dev-secret OPENROUTER_API_KEY=sk-or-…{'\n'}
            bun dev
          </code>
        </pre>
        <pre class="try">
          <code>
            curl -X POST localhost:4344/_janux/channels/webhook \{'\n'}
            {'  '}-H "authorization: Bearer dev-secret" \{'\n'}
            {'  '}-d {"'"}{'{"text":"what is on the board?"}'}{"'"}
          </code>
        </pre>
        <p class="hint">
          <code>export</code>, rather than the <code>VAR=… bun dev</code> prefix, on purpose: the prefix form only
          holds when the whole thing is a single line, and a key long enough to wrap usually is not — the variables
          stay in your shell and the server comes up without them. Either way they go <em>before</em>{' '}
          <code>bun dev</code>, because they are read when the modules load.
        </p>
        <p class="hint">
          The secret is yours to pick; it only has to match the <code>authorization: Bearer</code> header. The
          provider key can be any one of <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>,{' '}
          <code>GOOGLE_GENERATIVE_AI_API_KEY</code> or <code>OPENROUTER_API_KEY</code> — each picks that provider's
          default model (OpenRouter lands on <code>deepseek/deepseek-v4-flash</code>), and{' '}
          <code>JANUX_MODEL="provider/model"</code> overrides it.
        </p>
        <p class="hint">
          So each refusal tells you which half is missing: <code>503 channel_unconfigured</code> is the secret never
          reaching the server, <code>401</code> is a bearer that does not match, and{' '}
          <code>{'{"error":"setup"}'}</code> is no provider key — the turn still ran end to end, which is the
          transport proving itself. Anything else comes back with a <code>detail</code> carrying the provider's own
          words.
        </p>
      </header>
      <IncidentBoard />
    </main>
  );
}
