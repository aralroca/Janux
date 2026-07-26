import { createFsRouter, createJanuxServer } from '@janux/server';
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

function report(findings: VerifyFinding[]): void {
  const errors = findings.filter((finding) => finding.level === 'error').length;

  if (findings.length === 0) {
    console.log('janux verify: agent surface OK — every reachable tool has a description.');

    return;
  }
  findings.forEach((finding) =>
    console.log(`  ${finding.level.toUpperCase().padEnd(5)} ${finding.tool ? `${finding.tool} — ` : ''}${finding.message}`),
  );
  console.log(`\njanux verify: ${errors} error(s), ${findings.length - errors} warning(s).`);
}

export async function verify({ root }: CliCommand): Promise<void> {
  const options = await prodServerOptions(root);
  const server = createJanuxServer(options);
  const patterns = createFsRouter(options.routesDir!).routes.map((route) => route.pattern);
  const findings = await collectFindings(patterns, (path) => server.manifestFor(path, {}));

  report(findings);
  if (findings.some((finding) => finding.level === 'error')) process.exitCode = 1;
}
