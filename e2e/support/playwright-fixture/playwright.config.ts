import { defineConfig } from 'playwright/test';

/** Runs the committed `*.pw.ts` specs — a name bun test does not collect. */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.pw\.ts/,
  reporter: 'list',
  use: { channel: 'chrome' },
});
