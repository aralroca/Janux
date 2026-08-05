import { api } from '@janux/server';
import { schema, str, int, list } from 'janux';

/**
 * An on-call desk. The point of the example is that these three tools behave
 * identically whichever door the agent came through: reading is free, an
 * acknowledgement is an ordinary write, and paging a human at 3am is a
 * `confirm` guard — so an agent asking for it gets a proposal a person
 * approves, on the webhook exactly as in the browser.
 */

const SEED = [
  { id: 'INC-41', service: 'checkout', severity: 1, status: 'open', summary: 'Card authorisations timing out' },
  { id: 'INC-42', service: 'search', severity: 3, status: 'open', summary: 'Indexing lag above 10 minutes' },
  { id: 'INC-43', service: 'mailer', severity: 2, status: 'acknowledged', summary: 'Bounce rate doubled overnight' },
];

// In-memory on purpose: every boot starts from the same seed, so the scripted
// scenarios in the e2e suite are deterministic run after run.
const incidents = SEED.map((entry) => ({ ...entry }));
const pages: { id: string; engineer: string }[] = [];

const incidentShape = { id: str(), service: str(), severity: int(), status: str(), summary: str() };

function incidentById(id: string) {
  const found = incidents.find((entry) => entry.id === id);

  if (!found) throw new Error(`Unknown incident "${id}"`);

  return found;
}

export const list_incidents = api({
  description: 'List every incident on the board with its service, severity and status.',
  output: schema({ incidents: list(incidentShape) }),
  run: () => ({ incidents }),
});

export const acknowledge = api({
  description: 'Acknowledge an incident, so the board shows somebody has picked it up.',
  input: schema({ id: str() }),
  output: schema(incidentShape),
  run: ({ input }) => {
    const entry = incidentById(input.id);

    entry.status = 'acknowledged';

    return entry;
  },
});

export const page_engineer = api({
  description: 'Page the on-call engineer for an incident. It wakes a person up, so a human approves it first.',
  input: schema({ id: str(), engineer: str() }),
  output: schema({ id: str(), engineer: str(), paged: int() }),
  guard: 'confirm',
  run: ({ input }) => {
    incidentById(input.id);
    pages.push({ id: input.id, engineer: input.engineer });

    return { id: input.id, engineer: input.engineer, paged: pages.length };
  },
});

/** What the e2e reads to prove a `confirm` guard held on both doors. */
export const pagesSent = () => pages;
