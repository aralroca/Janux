import { defineConfig } from 'janux';

export default defineConfig({
  title: 'Janux Static Blog',
  // Public origin: opts into /sitemap.xml + /robots.txt and makes canonicals absolute.
  siteUrl: 'https://blog-static.janux.build',
  // Agent index at GET /llms.txt — posts appear concretely thanks to staticParams.
  llmsTxt: {
    title: 'Janux Static Blog',
    description: 'A fully static markdown blog. Read any post as markdown at /posts/<slug>.md.',
  },
  // `janux build` prerenders every page into dist/client — deploy without a server.
  output: 'static',
  navigation: {
    // With no client runtime every link is a browser navigation, so the
    // document-wide speculation rules do the prefetch-on-hover work.
    speculationRules: {
      eagerness: 'moderate',
      exclude: ['/llms.txt', '/sitemap.xml'],
    },
  },
});
