import { ReturnsDesk } from '../components/ReturnsDesk';

export const meta = {
  title: 'Returns desk — skills demo',
  description: 'A returns desk whose multi-step procedure ships as a skill the model loads on demand.',
};

export default function Home() {
  return (
    <main class="page">
      <header class="masthead">
        <h1>Returns desk</h1>
        <p class="hint">
          A refund is refused unless it carries the policy code for the reason on the order — a rule no tool
          description has room to teach. It lives in <code>src/skills/process-return.md</code>, which the model
          sees as one line until it decides the task is this one and calls <code>load_skill</code>.
        </p>
      </header>
      <ReturnsDesk />
    </main>
  );
}
