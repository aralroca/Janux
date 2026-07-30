import { defineConfig } from 'janux';

export default defineConfig({
  title: 'Janux Images',
  siteUrl: 'https://with-images.janux.build',
  // The archetype that needs the optimizer most: no server at runtime, so every
  // variant `<Image>` links to has to be a file `janux build` already wrote.
  output: 'static',
});
