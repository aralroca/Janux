import { defineConfig } from 'janux';

export default defineConfig({
  title: '__APP_NAME__',
  // Agent index at GET /llms.txt: every page and every tool, guards included.
  llmsTxt: {
    title: '__APP_NAME__',
    description: 'A customer back office. Routine CRUD executes; deleting a customer requires human approval.',
  },
});
