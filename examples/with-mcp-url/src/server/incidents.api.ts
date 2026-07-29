import { api } from '@janux/server';
import { enums, int, list as listOf, schema, str } from 'janux';
import { listIncidents, reportIncident, resolveIncident, type Severity } from './board';

/**
 * The whole agent surface of the app: three `api()` functions that the hosted
 * MCP endpoint (`/_janux/mcp`) advertises as tools, schemas included, with no
 * MCP code written here. Their contract is pinned by `agent-contract.json` and
 * asserted in `e2e/with-mcp-url.e2e.test.ts` — change a name, a guard or an
 * input schema and CI goes red until the golden file is updated on purpose.
 */

const SEVERITIES = ['low', 'high', 'critical'] as const;

const incident = {
  id: int(),
  title: str(),
  severity: enums(SEVERITIES),
  status: enums(['open', 'resolved']),
  reportedAt: str(),
};

export const list = api({
  description:
    'List every incident on the board (id, title, severity, status), newest first. ' +
    'Read this before acting on any incident — never answer from memory.',
  output: schema({ incidents: listOf(incident) }),
  run: () => ({ incidents: listIncidents() }),
});

export const report = api({
  description: 'Open a new incident on the board. Returns the stored incident, id included.',
  input: schema({ title: str().min(3).max(120), severity: enums(SEVERITIES) }),
  output: schema(incident),
  guard: 'auto',
  run: ({ input }) => reportIncident(input.title, input.severity as Severity),
});

export const resolve = api({
  description:
    'Mark an open incident as resolved. It closes the on-call trail, ' +
    'so an agent call becomes a proposal that a human approves first.',
  input: schema({ id: int() }),
  output: schema(incident),
  guard: 'confirm',
  run: ({ input }) => {
    const resolved = resolveIncident(input.id);

    if (!resolved) throw new Error(`No open incident with id ${input.id}`);

    return resolved;
  },
});
