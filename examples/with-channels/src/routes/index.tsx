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
        <pre class="try">
          <code>
            JANUX_WEBHOOK_SECRET=dev-secret bun dev{'\n'}
            curl -X POST localhost:4344/_janux/channels/webhook \{'\n'}
            {'  '}-H "authorization: Bearer dev-secret" \{'\n'}
            {'  '}-d {"'"}{'{"text":"what is on the board?"}'}{"'"}
          </code>
        </pre>
      </header>
      <IncidentBoard />
    </main>
  );
}
