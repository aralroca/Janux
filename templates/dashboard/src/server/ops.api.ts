import { api } from '@janux/server';
import { bool, enums, list, schema, str } from 'janux';

const incident = {
  id: str(),
  service: str(),
  title: str(),
  severity: enums(['critical', 'major', 'minor']),
  status: enums(['open', 'acknowledged', 'resolved']),
};

const SEED = [
  { id: 'INC-101', service: 'checkout', title: 'Payment webhooks timing out', severity: 'critical', status: 'open' },
  { id: 'INC-102', service: 'search', title: 'Indexer lagging 12 minutes behind', severity: 'major', status: 'open' },
  { id: 'INC-103', service: 'emails', title: 'Digest emails sent twice to some users', severity: 'minor', status: 'open' },
] as const;

// In-memory on purpose: every server boot starts from the same seed, so the
// scripted evals in evals/ are deterministic run after run. Swap for your
// database and keep the tool contracts identical.
const incidents = SEED.map((entry) => ({ ...entry })) as { id: string; service: string; title: string; severity: string; status: string }[];
const site = { maintenance: false, reason: '' };

function incidentById(id: string) {
  const found = incidents.find((entry) => entry.id === id);

  if (!found) throw new Error(`Unknown incident "${id}"`);

  return found;
}

export const board = api({
  description:
    'The live ops board: maintenance state and every incident with its service, severity and status. ' +
    'Call this before answering any question about incidents — never answer from memory.',
  output: schema({ maintenance: bool(), reason: str(), incidents: list(incident) }),
  run: () => ({ maintenance: site.maintenance, reason: site.reason, incidents }),
});

export const acknowledge = api({
  description: 'Take ownership of an open incident. Routine and reversible, so it executes immediately.',
  input: schema({ id: str() }),
  output: schema({ id: str(), status: str() }),
  run: ({ input }) => {
    const entry = incidentById(input.id);

    if (entry.status !== 'open') throw new Error(`"${entry.id}" is already ${entry.status}`);
    entry.status = 'acknowledged';

    return { id: entry.id, status: entry.status };
  },
});

export const resolve = api({
  description: 'Mark an acknowledged incident as resolved. Acknowledge first — resolving an incident nobody owns throws.',
  input: schema({ id: str() }),
  output: schema({ id: str(), status: str() }),
  run: ({ input }) => {
    const entry = incidentById(input.id);

    if (entry.status !== 'acknowledged') throw new Error(`Acknowledge "${entry.id}" before resolving it`);
    entry.status = 'resolved';

    return { id: entry.id, status: entry.status };
  },
});

export const maintenance = api({
  description:
    'Flip the whole site into (or out of) maintenance mode. Customer-visible: ' +
    'an agent call becomes a proposal a human settles via /_janux/approve.',
  input: schema({ enabled: bool(), reason: str().min(3) }),
  output: schema({ enabled: bool(), reason: str() }),
  guard: 'confirm',
  run: ({ input }) => {
    site.maintenance = input.enabled;
    site.reason = input.enabled ? input.reason : '';

    return { enabled: site.maintenance, reason: site.reason };
  },
});
