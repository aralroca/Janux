/**
 * Pages whose examples are compile-checked but not yet EXECUTED.
 *
 * Compiling a snippet proves it parses and imports real symbols; only running
 * it proves the behavior the prose claims. (A draft of recipes/forms.md said
 * `int()` coerces the "42" a form submits — it compiles, imports fine, and is
 * false. The executable test caught it.)
 *
 * `page-coverage.test.ts` fails when a page with runnable examples is neither
 * covered by a test in `pages/` nor listed here — so this list can only shrink,
 * and a NEW page can never be added without executing its examples.
 */
export const UNTESTED_PAGES: string[] = [
  'getting-started/project-structure.md',
  'guide/agent-and-copilot.md',
  'guide/api-rpc.md',
  'guide/components.md',
  'guide/http-handlers.md',
  'guide/i18n.md',
  'guide/interop.md',
  'guide/schema.md',
  'reference/agent-attachments.md',
  'reference/agent-mcp-client.md',
  'reference/agent-memory.md',
  'reference/agent-rate-limit.md',
  'reference/agent-workflows.md',
  'reference/build-internals.md',
  'reference/cli.md',
  'reference/client-api.md',
  'reference/client-state.md',
  'reference/client-tools.md',
  'reference/foreign.md',
  'reference/i18n-api.md',
  'reference/schema-api.md',
];
