import { AgentPanel } from '../components/AgentPanel';
import { ApprovalsInbox } from '../components/ApprovalsInbox';
import { PaymentsDesk } from '../components/PaymentsDesk';

export const meta = {
  title: 'Payments desk — human in the loop',
  description: 'Agents propose, humans approve, and one audit trail remembers who did what.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⏸ Human in the loop</span>
        <span class="bar-hint">Agents propose · humans approve · the audit trail remembers who did what</span>
      </header>
      <main class="split">
        <section class="work">
          <PaymentsDesk eager />
          <ApprovalsInbox eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
