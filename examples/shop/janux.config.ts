import { defineConfig } from 'janux';

export default defineConfig({
  navigation: {
    /*
     * Opt-in, like everywhere. The shop asks for it because its pages are small
     * and hover-prefetched, so fetching one in full before the swap costs
     * nothing visible — and in exchange the topbar wordmark is carried between
     * routes instead of blinking out with the rest of the page.
     */
    viewTransitions: true,
  },
});
