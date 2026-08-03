import { StatusBoard } from '../components/StatusBoard';
import { Copilot } from '../components/Copilot';

export const meta = {
  title: '__APP_NAME__ — ops dashboard',
  description: 'Incident triage with a copilot that drives the same board humans click.',
};

export default function Dashboard() {
  return (
    <div class="app">
      <header class="topbar">
        <a class="brand" href="/">
          ⏱ __APP_NAME__
        </a>
        <span class="bar-hint">Triage is instant · maintenance mode waits for a human</span>
      </header>
      <main class="split">
        <StatusBoard eager />
        <Copilot persist />
      </main>
    </div>
  );
}
