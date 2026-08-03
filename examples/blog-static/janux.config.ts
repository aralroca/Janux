import { defineConfig } from 'janux';
import { allPosts } from './src/content';

export default defineConfig({
  title: 'Janux Static Blog',
  // Public origin: opts into /sitemap.xml + /robots.txt and makes canonicals absolute.
  siteUrl: 'https://blog-static.janux.build',
  // Agent index at GET /llms.txt — posts appear concretely thanks to staticParams.
  llmsTxt: {
    title: 'Janux Static Blog',
    description: 'A fully static markdown blog. Read any post as markdown at /posts/<slug>.md.',
  },
  // The same idea for human readers: the posts at GET /rss.xml, newest first.
  feed: {
    description: 'A fully static markdown blog, built with Janux.',
    items: () =>
      allPosts().map((post) => ({
        url: `/posts/${post.id}`,
        title: post.data.title,
        description: post.data.description,
        date: post.data.date,
      })),
  },
  // `janux build` prerenders every page into dist/client — deploy without a server.
  output: 'static',
  navigation: {
    // With no client runtime every link is a browser navigation, so the
    // document-wide speculation rules do the prefetch-on-hover work.
    speculationRules: {
      eagerness: 'moderate',
      exclude: ['/llms.txt', '/sitemap.xml', '/rss.xml'],
    },
  },
});
