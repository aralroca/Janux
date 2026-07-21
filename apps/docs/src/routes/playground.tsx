import { Layout } from '../components/Layout';
import { PlaygroundShell } from '../components/PlaygroundShell';

export const meta = {
  title: 'Playground — Janux',
  description:
    'Edit a Janux component with full IntelliSense and watch both faces update live: the rendered UI and the agent surface (manifest, tools, resource, proposals).',
};

export default function PlaygroundPage() {
  return (
    <Layout current="/playground">
      <PlaygroundShell />
    </Layout>
  );
}
