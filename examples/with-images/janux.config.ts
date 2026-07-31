import { defineConfig } from 'janux';

export default defineConfig({
  title: 'Janux Images',
  siteUrl: 'https://with-images.janux.build',
  // The archetype that needs the optimizer most: no server at runtime, so every
  // variant `<Image>` links to has to be a file `janux build` already wrote.
  output: 'static',
  /*
   * The other half of CLS. Same reasoning as the images: the build self-hosts
   * the file, preloads it and writes a fallback face measured from it, so the
   * text occupies its final space from the first paint — with no server here to
   * do any of it at request time.
   */
  fonts: [{ family: 'Inter', weights: [400, 650], subsets: ['latin'], variable: '--font-sans' }],
});
