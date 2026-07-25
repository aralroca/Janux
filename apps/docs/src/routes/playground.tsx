import { Layout } from '../components/Layout';
import { PlaygroundShell } from '../components/PlaygroundShell';
import { SOCIAL_IMAGE } from '../site';

export const meta = {
  title: 'Playground — Janux',
  canonical: '/playground',
  image: SOCIAL_IMAGE,
  description:
    'Edit a Janux component with full IntelliSense and watch both faces update live: the rendered UI and the agent surface (manifest, tools, resource, proposals).',
};

export default function PlaygroundPage() {
  return (
    <Layout current="/playground">
      <PlaygroundShell eager />
    </Layout>
  );
}
