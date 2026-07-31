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
  /*
   * Dogfood: the site used to ship the system stack, which never shifts because
   * it never loads. A real webfont is the honest test of the primitive — one
   * self-hosted variable file covering every weight the sheet uses, preloaded,
   * with a fallback face measured from that very file so the swap moves nothing.
   */
  fonts: [
    {
      family: 'Inter',
      weights: [400, 600, 700, 800],
      subsets: ['latin'],
      variable: '--font-sans',
    },
  ],
  llmsTxt: {
    title: 'Janux',
    description:
      'The fullstack framework for the Agentic Web. One component, two faces: a live view for humans, typed MCP tools & resources for AI agents.',
  },
});
