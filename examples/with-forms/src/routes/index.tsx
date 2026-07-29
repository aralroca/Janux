import { Registration } from '../components/Registration';

export const meta = {
  title: 'Janux — validated forms',
  description: 'A registration form where one schema drives the UI, the endpoint and the agent tool.',
};

export default function Home() {
  return (
    <main class="page">
      <Registration eager />
    </main>
  );
}
