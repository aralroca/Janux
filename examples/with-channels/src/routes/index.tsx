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
          Start it with your own key in place of <code>sk-or-…</code> — one command, run from this folder:
        </p>
        <pre class="try">
          <code>pkill -f "janux dev"; OPENROUTER_API_KEY=sk-or-… JANUX_WEBHOOK_SECRET=dev-secret bun dev</code>
        </pre>
        <pre class="try">
          <code>
            curl -X POST localhost:4344/_janux/channels/webhook \{'\n'}
            {'  '}-H "authorization: Bearer dev-secret" \{'\n'}
            {'  '}-d {"'"}{'{"text":"what is on the board?"}'}{"'"}
          </code>
        </pre>
        <p class="hint">
          The <code>pkill</code> is not decoration: a <code>janux dev</code> left running on this port keeps answering
          with the environment <em>it</em> was started with, while the new one prints the same banner without ever
          owning the port — so a key you just added looks like it was ignored.
        </p>
        <p class="hint">
          Both variables go <em>before</em> the command, because they are read when the modules load. The secret is
          yours to pick; it only has to match the <code>authorization: Bearer</code> header — unset gives every caller{' '}
          <code>503</code>, wrong gives <code>401</code>. The provider key can be any one of{' '}
          <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GOOGLE_GENERATIVE_AI_API_KEY</code> or{' '}
          <code>OPENROUTER_API_KEY</code>; without one the turn still runs end to end and answers{' '}
          <code>{'{"error":"setup"}'}</code>, which is the transport proving itself.
        </p>
      </header>
      <IncidentBoard />
    </main>
  );
}
