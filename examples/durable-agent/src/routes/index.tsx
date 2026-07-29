import type { PageMeta } from 'janux';
import { RATE_LIMIT, backendSummary } from '../server/config';

export const meta: PageMeta = {
  title: 'Janux — durable agent',
  description:
    'The full @janux/agent harness in production shape: Postgres memory, Redis rate limiting, guardrails and durable workflows.',
};

const FEATURES = [
  ['Postgres memory', 'Threads and messages live in janux_threads/janux_messages — a restart loses nothing.'],
  ['Redis rate limiting', `${RATE_LIMIT.limit} requests per minute per identity, one shared budget across instances.`],
  ['Guardrails', 'Every turn is normalized and screened; hostile input gets a typed refusal, never the model.'],
  ['Durable workflow', 'Provisioning suspends waiting for a human and resumes after a restart, state intact.'],
] as const;

export default function HomePage() {
  const backends = backendSummary();

  return (
    <main>
      <h1>Durable agent</h1>
      <p>
        The <code>@janux/agent</code> harness wired for production. Without <code>.env</code> everything falls back to
        in-memory adapters — same code, dev-friendly. Copy <code>.env.example</code> and run{' '}
        <code>docker-compose up</code> to make it durable.
      </p>
      <dl>
        <dt>Conversation & workflow storage</dt>
        <dd>{backends.storage}</dd>
        <dt>Rate-limit counter store</dt>
        <dd>{backends.rateLimitStore}</dd>
      </dl>
      <ul>
        {FEATURES.map(([name, detail]) => (
          <li key={name}>
            <strong>{name}</strong> — {detail}
          </li>
        ))}
      </ul>
      <p>
        The agent surface is <code>/_janux/manifest</code>; talk to it via <code>POST /_janux/agent</code> (without a
        model key it answers with a setup card, but memory, guardrails and rate limiting are active either way).
      </p>
    </main>
  );
}
