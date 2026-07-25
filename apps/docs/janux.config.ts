import { defineConfig } from 'janux';
import { SITE_URL } from './src/site';

export default defineConfig({
  output: 'static',
  siteUrl: SITE_URL,
  // The sheet is ~5 KB gzipped: cheaper to inline than to block the first paint on.
  inlineStyles: true,
  llmsTxt: {
    title: 'Janux',
    description:
      'The agent-native fullstack UI framework. One component, two faces: a live view for humans, typed MCP tools & resources for AI agents.',
  },
});
