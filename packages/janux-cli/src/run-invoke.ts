import type { JanuxInstance, Proposal } from 'janux';
import type { ManifestTool } from 'janux/manifest';
import type { InstanceHooks } from '@janux/server';
import type { RunIo, RunTarget, RunnableTool } from './run-types';

/**
 * The two transports a Janux tool already has, driven from a terminal.
 *
 * An `api()` IS an HTTP endpoint, so it is called over its own HTTP boundary
 * (in-process — no port, no socket): guards, audit, CSRF and the proposal vault
 * are the ones the browser meets. An intent belongs to a mounted component, so
 * it is invoked on the instance a render mounts, exactly as the client bridge
 * does it.
 *
 * Both call as `origin: 'agent'`. A terminal is not a session: there is no
 * signed-in human behind a CI job, so the CLI knocks on the door an agent
 * knocks on — `forbidden` denies and `confirm` parks, instead of a `human`
 * origin waving both through.
 */

const API_PREFIX = 'api.';
/** The app talking to itself: no port is involved, but its own boundary still wants an origin. */
const LOCAL = 'http://localhost';
const APPROVED = /^y(es)?$/i;

/** A parked call the human has to settle, whichever half of the surface parked it. */
export interface Parked {
  input: unknown;
  execute: () => Promise<unknown>;
}

export function isApiTool(tool: ManifestTool): boolean {
  return tool.name.startsWith(API_PREFIX);
}

/**
 * A `confirm` guard is a human decision. With nobody at the terminal there is
 * no decision to be had, so this refuses instead of assuming yes — a scripted
 * run that silently approved its own irreversible call is the failure mode the
 * guard exists to prevent.
 */
export function approved(tool: ManifestTool, parked: Parked, io: RunIo): boolean {
  if (!io.ask) return false;

  return APPROVED.test((io.ask(`janux run: approve ${tool.name} ${JSON.stringify(parked.input)}? [y/N] `) ?? '').trim());
}

/** Nothing has run at this point — the guard parked the call, and only an approval releases it. */
async function settle(tool: ManifestTool, parked: Parked, io: RunIo): Promise<unknown> {
  if (approved(tool, parked, io)) return parked.execute();
  if (io.ask) throw new Error(`janux run: "${tool.name}" was not approved — nothing ran`);

  throw new Error(`janux run: "${tool.name}" is guarded by "confirm" and stdin is not a terminal — refusing. Nothing ran.`);
}

function jsonRequest(base: string, path: string, body: unknown, headers: Record<string, string>): Request {
  return new Request(`${base}${path}`, {
    method: 'POST',
    // The app's own origin: a non-browser client declares which origin it acts
    // for, and this one is the app itself (see csrf.ts).
    headers: { 'content-type': 'application/json', origin: base, ...headers },
    body: JSON.stringify(body),
  });
}

async function post(target: RunTarget, path: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
  const response = await target.server.fetch(jsonRequest(target.base ?? LOCAL, path, body, headers));
  const payload = await response.json().catch(() => undefined);

  if (!payload?.ok) throw new Error(String(payload?.error ?? `janux run: ${path} answered ${response.status}`));

  return payload.result;
}

function isProposal(result: any): result is { status: 'proposal'; id: string; input: unknown } {
  return result?.status === 'proposal';
}

/**
 * `POST /_janux/api/<name>` as an agent, then — if the guard parked it — the
 * approval a human gives, which is a different request on purpose: the CLI
 * relays the answer, it does not decide.
 */
async function invokeApiTool(target: RunTarget, tool: ManifestTool, input: unknown, io: RunIo): Promise<unknown> {
  const name = tool.name.slice(API_PREFIX.length);
  const result = await post(target, `/_janux/api/${name}`, input, { 'x-janux-origin': 'agent' });

  if (!isProposal(result)) return result;

  return settle(tool, { input: result.input, execute: () => post(target, '/_janux/approve', { id: result.id }) }, io);
}

function intentOn(instances: JanuxInstance[], tool: RunnableTool) {
  const dot = tool.name.lastIndexOf('.');
  const instance = instances.find((candidate) => candidate.def.name === tool.name.slice(0, dot));
  const invoke = instance?.intents[tool.name.slice(dot + 1)];

  if (!instance || !invoke) throw new Error(`janux run: "${tool.name}" is not mounted on ${tool.route}`);

  return { instance, invoke };
}

/** Renders the page that mounts the intent and calls it — the proposal, if any, arrives through `hooks`. */
async function invokeIntentTool(target: RunTarget, tool: RunnableTool, input: unknown, io: RunIo): Promise<unknown> {
  const parked: Proposal[] = [];
  // No diff: a terminal shows none, and computing one would shadow-run the
  // body of the very call the human has not approved yet.
  const hooks: InstanceHooks = { onProposal: (p) => parked.push(p), onAudit: target.onAudit, proposalDiff: false };
  const { instance, invoke } = intentOn(await target.server.instancesFor(tool.route!, target.ctx, hooks), tool);
  const result: any = await invoke(input, { origin: 'agent' });

  await instance.settled();
  if (!isProposal(result)) return result;
  const proposal = parked.find((candidate) => candidate.id === result.id);

  if (!proposal) throw new Error(`janux run: "${tool.name}" was parked without a way to execute it`);

  return settle(tool, proposal, io);
}

export function invokeTool(target: RunTarget, tool: RunnableTool, input: unknown, io: RunIo): Promise<unknown> {
  if (isApiTool(tool)) return invokeApiTool(target, tool, input, io);

  return invokeIntentTool(target, tool, input, io);
}
