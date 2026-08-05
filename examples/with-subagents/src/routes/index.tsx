import { INVOICES } from '../server/billing.api';
import { KNOWLEDGE_BASE } from '../server/support.api';

export const meta = {
  title: 'Janux — subagents & handoffs',
  description: 'One agent config composing a front desk, a budgeted research subagent and a billing handoff target.',
};

export default function Home() {
  return (
    <main style={{ maxWidth: '46rem', margin: '2rem auto', fontFamily: 'system-ui, sans-serif', lineHeight: '1.6' }}>
      <h1>🤝 Subagents &amp; handoffs</h1>
      <p>
        The copilot of this app is three agents in one config: a <strong>front desk</strong>, a <strong>research
        subagent</strong> it delegates focused lookups to (own prompt, only <code>api.support.*</code>, mandatory
        budget), and a <strong>billing agent</strong> it hands money conversations over to (own prompt, only{' '}
        <code>api.billing.*</code>, answers the user from then on).
      </p>
      <p>
        Try it with a model key: ask <em>“what is an island?”</em> (delegation) and <em>“refund order A-1002”</em>{' '}
        (handoff). The front desk excludes <code>api.admin.*</code>, so neither it nor any subagent can reach{' '}
        <code>admin.purge</code> — the intersection rule, proven in this example's e2e suite.
      </p>
      <h2>Knowledge base (what research sees)</h2>
      <ul>
        {KNOWLEDGE_BASE.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.topic}</strong> — {entry.body} <small>({entry.id})</small>
          </li>
        ))}
      </ul>
      <h2>Invoices (what billing sees)</h2>
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
