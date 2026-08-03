import type { FeedConfig } from 'janux';
import { docIndex } from './server/docs.api';

/** llms.txt for agents, rss.xml for humans: the same index, one entry per doc. */
export default {
  title: 'Janux docs',
  description: 'Guides, tutorials and reference for Janux, the fullstack framework for the Agentic Web.',
  items: () => docIndex().map(({ path, title, description }) => ({ url: path, title, description })),
} satisfies FeedConfig;
