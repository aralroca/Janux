import { AgentPanel } from '../components/AgentPanel';
import { ConfirmDialogShell } from '../components/ConfirmDialogShell';

export const meta = {
  title: 'Janux — React a11y primitives interop',
  description: 'Radix Dialog mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ A11y primitives interop</span>
        <span class="bar-hint">The dialog is @radix-ui · the state and intents are Janux</span>
        <a class="bar-link" href="/settings">
          Settings →
        </a>
      </header>
      <main class="split">
        <section class="preview">
          <ConfirmDialogShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
