import { defineConfig } from 'janux';

/**
 * The whole bearer protection for `POST /_janux/mcp`, declaratively:
 * `AGENT_TOKEN` (read at boot) wins, the literal is the out-of-the-box demo
 * default. GET stays public — a browser still gets the landing page, now with
 * the `--header "Authorization: Bearer $TOKEN"` connect commands.
 */
export default defineConfig({
  mcpAuth: { tokenEnv: 'AGENT_TOKEN', token: 'demo-agent-token' },
});
