import { createFsRouter, createJanuxServer, type Skill } from '@janux/server';
import { CLIENT_TOOL_NAMES } from 'janux';
import type { ManifestTool } from 'janux/manifest';
import { prodServerOptions } from './prod';
import type { CliCommand } from './args';

export interface VerifyFinding {
  level: 'error' | 'warn';
  tool?: string;
  message: string;
}

interface ManifestLike {
  tools: ManifestTool[];
}

/** Contract checks over one route's manifest: every agent-reachable tool needs a description. */
export function auditManifest(manifest: ManifestLike): VerifyFinding[] {
  return manifest.tools
    .filter((tool) => !tool.description)
    .map((tool) => ({
      level: 'error' as const,
      tool: tool.name,
      message: `missing description (agent-reachable, guard "${tool.guard}")`,
    }));
}

function dedupeFindings(findings: VerifyFinding[]): VerifyFinding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = finding.tool ?? finding.message;

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}

/** Renders every route's manifest and aggregates findings (routes that fail to render are warnings). */
export async function collectFindings(
  patterns: string[],
  manifestFor: (path: string) => Promise<unknown>,
): Promise<VerifyFinding[]> {
  const perRoute = await Promise.all(
    patterns.map(async (pattern) => {
      try {
        return auditManifest((await manifestFor(pattern)) as ManifestLike);
      } catch (error) {
        return [
          {
            level: 'warn' as const,
            message: `route "${pattern}" failed to render — its agent surface was not verified (${error})`,
          },
        ];
      }
    }),
  );

  return dedupeFindings(perRoute.flat());
}

/**
 * Skill verification — the check other frameworks structurally cannot run.
 *
 * A skill is prose written for a model, so anywhere else it may confidently
 * name a tool that does not exist, and the first thing that finds out is a live
 * agent. Here the tool list is *derived* from the mounted tree, so the same
 * manifest that makes drift impossible for tools makes a lying skill
 * detectable: the names it declares and the names it writes down have to be
 * names the app really answers to.
 */

/** `Component.intent`, `api.module.fn` — hyphens included, since component names allow them. */
const TOOL_TOKEN = /[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)+/g;
const CLIENT_TOOL_TOKEN = /\bui_[a-z_]+/g;

/** Every tool an agent may actually call: each route's manifest, plus the client tools it always has. */
export async function knownTools(patterns: string[], manifestFor: (path: string) => Promise<unknown>): Promise<Set<string>> {
  const perRoute = await Promise.all(
    patterns.map(async (pattern) => {
      const manifest = await manifestFor(pattern).catch(() => undefined);

      return ((manifest as ManifestLike | undefined)?.tools ?? []).map((tool) => tool.name);
    }),
  );

  return new Set([...perRoute.flat(), ...CLIENT_TOOL_NAMES]);
}

/** The first segment of every real tool name: what makes a dotted token in prose a tool reference. */
function namespacesOf(tools: ReadonlySet<string>): Set<string> {
  return new Set([...tools].map((name) => name.split('.')[0]!));
}

/**
 * Tool names the body writes down — anywhere: prose, inline code, or the worked
 * example a model is most likely to copy from.
 *
 * The gate is the *namespace*, not the formatting. A dotted token counts only
 * when its first segment is one the app really has, so `janux.config.ts` and
 * `import.meta.url` stay prose while `bare-cart.remove` is held to exactly the
 * standard a declared tool is.
 */
function mentionedTools(body: string, namespaces: ReadonlySet<string>): string[] {
  const dotted = [...body.matchAll(TOOL_TOKEN)].map(([token]) => token).filter((token) => namespaces.has(token.split('.')[0]!));

  return [...dotted, ...[...body.matchAll(CLIENT_TOOL_TOKEN)].map(([token]) => token)];
}

function auditSkill(skill: Skill, tools: ReadonlySet<string>, namespaces: ReadonlySet<string>): VerifyFinding[] {
  const referenced = new Set([...skill.tools, ...mentionedTools(skill.body, namespaces)]);

  return [...referenced]
    .filter((tool) => !tools.has(tool))
    .map((tool) => ({
      level: 'error' as const,
      tool,
      message: `skill "${skill.name}" (${skill.file}) references a tool this app does not have`,
    }));
}

/**
 * Contract checks over the app's skills: every tool a procedure names has to
 * exist.
 *
 * `complete` is whether every route rendered. When one did not, it contributed
 * none of its intents, so the tool list is short through no fault of the skill
 * — saying "this app does not have that tool" would be a false statement, and a
 * red build over it sends somebody to the wrong file. The unrendered route is
 * already a warning; these join it as warnings rather than escalating it.
 */
export function auditSkills(skills: readonly Skill[], tools: ReadonlySet<string>, complete = true): VerifyFinding[] {
  const namespaces = namespacesOf(tools);
  const findings = skills.flatMap((skill) => auditSkill(skill, tools, namespaces));

  if (complete) return findings;

  return findings.map((finding) => ({
    ...finding,
    level: 'warn' as const,
    message: `${finding.message} — unverified: a route failed to render, so the tool list is incomplete`,
  }));
}

function report(findings: VerifyFinding[], skillCount = 0): void {
  const errors = findings.filter((finding) => finding.level === 'error').length;
  const skillsOk = skillCount > 0 ? `, and ${skillCount} skill(s) name only tools that exist` : '';

  if (findings.length === 0) {
    console.log(`janux verify: agent surface OK — every reachable tool has a description${skillsOk}.`);

    return;
  }
  findings.forEach((finding) =>
    console.log(`  ${finding.level.toUpperCase().padEnd(5)} ${finding.tool ? `${finding.tool} — ` : ''}${finding.message}`),
  );
  console.log(`\njanux verify: ${errors} error(s), ${findings.length - errors} warning(s).`);
}

/** Both audits walk the same routes; rendering each one twice is pure waste. */
function memoized(manifestFor: (path: string) => Promise<unknown>): (path: string) => Promise<unknown> {
  const rendered = new Map<string, Promise<unknown>>();

  return (path) => {
    const manifest = rendered.get(path) ?? manifestFor(path);

    rendered.set(path, manifest);

    return manifest;
  };
}

export async function verify({ root }: CliCommand): Promise<void> {
  // A check must not run the app's background jobs — see `ProdOptions`.
  const options = await prodServerOptions(root, undefined, { schedules: false });
  const server = createJanuxServer(options);
  const patterns = createFsRouter(options.routesDir!).routes.map((route) => route.pattern);
  const manifestFor = memoized((path) => server.manifestFor(path, {}));
  const skills = options.skills ?? [];
  const surface = await collectFindings(patterns, manifestFor);
  const complete = !surface.some((finding) => finding.level === 'warn');
  const findings = [...surface, ...auditSkills(skills, await knownTools(patterns, manifestFor), complete)];

  report(findings, skills.length);
  if (findings.some((finding) => finding.level === 'error')) process.exitCode = 1;
}
