import { defineConfig } from 'janux';

export default defineConfig({
  title: '__APP_NAME__',
  // Agent index at GET /llms.txt: every page and every tool, guards included.
  llmsTxt: {
    title: '__APP_NAME__',
    description: 'An ops dashboard. Read the board with api.ops.board; maintenance mode requires human approval.',
  },
});
