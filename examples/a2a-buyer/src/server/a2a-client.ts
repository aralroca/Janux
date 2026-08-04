/**
 * An ordinary A2A client — the outside half of the demo.
 *
 * Nothing here is Janux-specific: it reads the supplier's card at the
 * well-known URI, finds the JSON-RPC interface, and talks to it. That is the
 * point of the example — the supplier is reachable by anything that speaks the
 * protocol, and this file would work unchanged against an agent built with
 * something else entirely.
 *
 * @see https://a2a-protocol.org/latest/specification/
 */

/**
 * Where the supplier lives — the only thing this app is told about it. Read per
 * call rather than frozen at import: the origin is deployment configuration,
 * and a module that captures it at load time answers with a stale one whenever
 * it happens to be imported before the environment is set.
 */
export const supplierOrigin = (): string => process.env.SUPPLIER_URL ?? 'http://localhost:4341';

export interface AgentCard {
  name: string;
  description: string;
  supportedInterfaces: { url: string; protocolBinding: string; protocolVersion: string }[];
  skills: { id: string; description: string; tags: string[] }[];
  capabilities: { extensions?: { uri: string; params?: { schemas?: Record<string, unknown> } }[] };
}

export interface Task {
  id: string;
  contextId: string;
  status: { state: string; message?: { parts: { text?: string; data?: any }[] } };
  artifacts?: { name: string; parts: { text?: string; data?: any }[] }[];
}

const CARD_PATH = '/.well-known/agent-card.json';

export async function discover(base = supplierOrigin()): Promise<AgentCard> {
  const response = await fetch(`${base}${CARD_PATH}`);

  if (!response.ok) throw new Error(`No agent card at ${base}${CARD_PATH} (${response.status})`);

  return response.json() as Promise<AgentCard>;
}

/** The endpoint the card says to use, rather than a URL this app guessed. */
export async function endpointOf(base = supplierOrigin()): Promise<string> {
  const interfaces = (await discover(base)).supportedInterfaces;
  const jsonRpc = interfaces.find((entry) => entry.protocolBinding === 'JSONRPC');

  if (!jsonRpc) throw new Error(`${base} advertises no JSON-RPC interface`);

  return jsonRpc.url;
}

async function rpc(url: string, method: string, params: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json();

  if (payload.error) throw new Error(`${payload.error.code} ${payload.error.message}`);

  return payload.result;
}

/** One skill call, as the card's tool-invocation extension describes it. */
export async function callSkill(skill: string, input: unknown, base = supplierOrigin()): Promise<Task> {
  const message = { role: 'ROLE_USER', messageId: crypto.randomUUID(), parts: [{ data: { skill, input } }] };

  return (await rpc(await endpointOf(base), 'SendMessage', { message })).task;
}

export async function readTask(id: string, base = supplierOrigin()): Promise<Task> {
  return rpc(await endpointOf(base), 'GetTask', { id });
}
