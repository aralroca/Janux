/**
 * The in-memory incident board behind the `api()` tools. A Map instead of a
 * database keeps the example about the MCP surface, not about persistence —
 * restart the server and the seed is back, which is exactly what a demo wants.
 */

export type Severity = 'low' | 'high' | 'critical';

export interface Incident {
  id: number;
  title: string;
  severity: Severity;
  status: 'open' | 'resolved';
  reportedAt: string;
}

const SEED: [string, Severity][] = [
  ['Checkout latency above 2s at p95', 'high'],
  ['Stale prices on the EU product feed', 'low'],
  ['Login loop for SSO tenants', 'critical'],
];

let nextId = 1;

function makeIncident(title: string, severity: Severity): Incident {
  return { id: nextId++, title, severity, status: 'open', reportedAt: new Date().toISOString() };
}

const incidents = new Map<number, Incident>(
  SEED.map(([title, severity]) => makeIncident(title, severity)).map((incident) => [incident.id, incident]),
);

/** Newest first, like any on-call board. */
export function listIncidents(): Incident[] {
  return [...incidents.values()].sort((a, b) => b.id - a.id);
}

export function reportIncident(title: string, severity: Severity): Incident {
  const incident = makeIncident(title, severity);

  incidents.set(incident.id, incident);

  return incident;
}

/** Undefined when the id is unknown or the incident is already resolved. */
export function resolveIncident(id: number): Incident | undefined {
  const incident = incidents.get(id);

  if (!incident || incident.status === 'resolved') return undefined;
  const resolved: Incident = { ...incident, status: 'resolved' };

  incidents.set(id, resolved);

  return resolved;
}
