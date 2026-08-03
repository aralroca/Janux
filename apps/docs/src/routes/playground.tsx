import type { PageMeta } from 'janux';
import { Layout } from '../components/Layout';
import { PlaygroundShell } from '../components/PlaygroundShell';
import { SOCIAL_DEFAULTS, SOCIAL_IMAGE } from '../site';

export const meta: PageMeta = {
  title: 'Playground — Janux',
  canonical: '/playground',
  image: SOCIAL_IMAGE,
  og: { ...SOCIAL_DEFAULTS, type: 'website' },
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
