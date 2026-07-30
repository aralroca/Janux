import { AgentPanel } from '../components/AgentPanel';
import { SignupFormShell } from '../components/SignupFormShell';

export const meta = {
  title: 'Janux — React forms interop',
  description: 'react-hook-form mounted unchanged, driven by Janux intents.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Forms interop</span>
        <span class="bar-hint">The form is react-hook-form + zod · the draft and intents are Janux</span>
      </header>
      <main class="split">
        <section class="preview">
          <SignupFormShell eager />
        </section>
        <AgentPanel eager />
      </main>
    </div>
  );
}
