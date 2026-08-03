import { AgentPanel } from '../components/AgentPanel';
import { ApprovalsInbox } from '../components/ApprovalsInbox';
import { CustomersDesk } from '../components/CustomersDesk';

export const meta = {
  title: '__APP_NAME__ — customer back office',
  description: 'Agents propose, humans approve, and one audit trail remembers who did what.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⏸ __APP_NAME__</span>
        <span class="bar-hint">Agents propose · humans approve · the audit trail remembers who did what</span>
      </header>
      <main class="split">
        <section class="work">
          <CustomersDesk eager />
          <ApprovalsInbox eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
