import { defineConfig } from 'janux';

export default defineConfig({
  title: 'Basecamp — an offline trail companion',
  // Prerendered to files: the archetype a service worker is worth most to. A
  // static host has no server to fall back to, so once the network is gone the
  // cache is the whole application.
  output: 'static',
  // Nothing here turns the worker on — `src/sw.ts` existing is what does that.
  // This only says who registers it, and `true` is the default.
  serviceWorker: { register: true },
});
