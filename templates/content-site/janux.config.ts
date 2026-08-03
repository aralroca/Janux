import { defineConfig } from 'janux';

export default defineConfig({
  title: '__APP_NAME__',
  // Set your public origin to opt into /sitemap.xml + /robots.txt and absolute canonicals:
  // siteUrl: 'https://example.com',
  // Agent index at GET /llms.txt — the posts appear concretely thanks to staticParams.
  llmsTxt: {
    title: '__APP_NAME__',
    description: 'A markdown content site. Read any post as markdown at /posts/<slug>.md, or search it with api.site.search.',
  },
});
