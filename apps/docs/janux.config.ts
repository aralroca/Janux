import { defineConfig } from 'janux';
import { SITE_URL } from './src/site';

export default defineConfig({
  /*
   * The site itself would be happy as a static export, but it advertises the
   * framework's server surface — `/_janux/mcp`, the manifest, the `.md`
   * projection of every page — and an advertisement that 404s is a lie. So the
   * docs deploy as a Bun server (see recipes/vercel.md) and dogfood SSR.
   */
  output: 'bun',
  siteUrl: SITE_URL,
  // The sheet is ~5 KB gzipped: cheaper to inline than to block the first paint on.
  inlineStyles: true,
  llmsTxt: {
    title: 'Janux',
    description:
      'The agent-native fullstack UI framework. One component, two faces: a live view for humans, typed MCP tools & resources for AI agents.',
  },
});
