import { defineConfig } from 'janux';

export default defineConfig({
  title: 'Janux Field Notes',
  // Public origin: opts into /sitemap.xml + /robots.txt and makes canonicals absolute.
  siteUrl: 'https://with-content.janux.build',
  // Agent index at GET /llms.txt — the notes appear concretely thanks to staticParams.
  llmsTxt: {
    title: 'Janux Field Notes',
    description:
      'Markdown and MDX notes served from a typed content collection. Read any note as markdown at /notes/<slug>.md.',
  },
  // `janux build` prerenders every published note into dist/client. MDX is
  // compiled here, at build time, which is why a note of prose ships 0 KB.
  output: 'static',
});
