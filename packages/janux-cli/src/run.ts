import { createJanuxServer } from '@janux/server';
import { parseToolArgs, toolList, usageFor } from './run-args';
import { invokeTool, isApiTool } from './run-invoke';
import { prodServerOptions } from './prod';
import type { CliCommand } from './args';
import type { RunIo, RunTarget, RunnableTool } from './run-types';
import type { ManifestTool } from 'janux/manifest';

/**
 * `janux run <tool> --arg value`: the terminal projection of the agent surface.
 *
 * Nothing here is declared by the app. The tools are the ones the manifest
 * advertises — a `forbidden` guard never reaches this list, exactly as it never
 * reaches an agent — the flags are the ones their input schema describes, and
 * the invocation is the pipeline every other caller goes through. What it buys
 * is scripting and CI against your own app without writing a client for it.
 */

export type { RunIo, RunTarget } from './run-types';

interface PageManifest {
  routes?: string[];
  tools?: ManifestTool[];
}

/** `api()` tools are app-wide, so the page that reported one is not part of its identity. */
function tagged(tools: ManifestTool[], route: string): RunnableTool[] {
  return tools.map((tool) => (isApiTool(tool) ? tool : { ...tool, route }));
}

async function manifestOf(target: RunTarget, route: string): Promise<PageManifest> {
  return (await target.server.manifestFor(route, target.ctx).catch(() => ({}))) as PageManifest;
}

function deduped(tools: RunnableTool[]): RunnableTool[] {
  return [...new Map(tools.map((tool) => [tool.name, tool])).values()];
}

/**
 * Every tool the app projects: the `api()` ones (which every page's manifest
 * carries) and each page's mounted intents, deduped by name in route order.
 *
 * A `wanted` tool already on the entry page ends the search there — `janux run
 * api.orders.reconcile` must not cost a render of every route in the app.
 */
export async function runnableTools(target: RunTarget, wanted?: string): Promise<RunnableTool[]> {
  const entry = await manifestOf(target, '/');
  const here = tagged(entry.tools ?? [], '/');

  if (wanted !== undefined && here.some((tool) => tool.name === wanted)) return here;
  const elsewhere = await Promise.all(
    (entry.routes ?? [])
      .filter((route) => route !== '/')
      .map(async (route) => tagged((await manifestOf(target, route)).tools ?? [], route)),
  );

  return deduped([...here, ...elsewhere.flat()]);
}

/** What went wrong, as the terminal should read it. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportUnknown(name: string, tools: RunnableTool[], io: RunIo): number {
  io.err(`janux run: unknown tool "${name}".\n\n${toolList(tools)}`);

  return 1;
}

function inputFor(tool: RunnableTool, argv: string[], io: RunIo): Record<string, unknown> | undefined {
  try {
    return parseToolArgs(argv, tool.input);
  } catch (error) {
    io.err(`${messageOf(error)}\n\n${usageFor(tool)}`);

    return undefined;
  }
}

async function invoke(target: RunTarget, tool: RunnableTool, input: Record<string, unknown>, io: RunIo): Promise<number> {
  try {
    io.out(`${JSON.stringify((await invokeTool(target, tool, input, io)) ?? null, null, 2)}\n`);

    return 0;
  } catch (error) {
    io.err(`${messageOf(error)}\n`);

    return 1;
  }
}

/** Resolves the named tool against the manifest and runs it; the exit code is the answer. */
export async function runTool(target: RunTarget, argv: string[], io: RunIo): Promise<number> {
  const [name, ...rest] = argv;
  const tools = await runnableTools(target, name);
  const tool = tools.find((candidate) => candidate.name === name);

  if (!name) {
    io.out(toolList(tools));

    return 0;
  }
  if (!tool) return reportUnknown(name, tools, io);
  if (rest.includes('--help')) {
    io.out(usageFor(tool));

    return 0;
  }
  const input = inputFor(tool, rest, io);

  return input === undefined ? 1 : invoke(target, tool, input, io);
}

/** `prompt()` only means something with a terminal on the other side; without one there is nobody to ask. */
function terminalIo(): RunIo {
  const io: RunIo = { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) };

  if (!process.stdin.isTTY) return io;

  return { ...io, ask: (question) => prompt(question) };
}

export async function runCommand({ root }: CliCommand, argv: string[]): Promise<void> {
  // A single invocation must not mount the app's background jobs, for the same
  // reason `janux build` and `janux verify` do not: claiming a schedule
  // occurrence is a side effect nobody asked this command for.
  const options = await prodServerOptions(root, undefined, { schedules: false });
  const server = createJanuxServer(options);
  // No request, no cookies, no session, nothing signed: the anonymous ctx an
  // unauthenticated caller gets, so a guard that depends on a user denies
  // rather than inherits — and a tool that declares `scopes` is out of reach
  // from the terminal unless `ctxFor` grants them from somewhere that is not a
  // browser (an env token, say).
  const ctx = (await options.ctxFor?.(new Request('http://localhost/'), { session: undefined, agent: null })) ?? {};
  const target: RunTarget = { server, ctx, base: 'http://localhost', onAudit: options.onAudit };

  process.exitCode = await runTool(target, argv, terminalIo());
}
