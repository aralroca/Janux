import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { vercelConfig, type VercelConfigOptions } from './index';
import { writeVercelOutput } from './output';

export interface VercelArgs {
  include: string[];
  maxDuration?: number;
}

/** `janux-vercel --include content --max-duration 60` */
export function parseVercelArgs(argv: string[]): VercelArgs {
  const value = (flag: string) => argv[argv.indexOf(flag) + 1];
  const duration = argv.includes('--max-duration') ? Number(value('--max-duration')) : undefined;

  return {
    include: argv.flatMap((arg, index) => (arg === '--include' && argv[index + 1] ? [argv[index + 1]!] : [])),
    maxDuration: Number.isFinite(duration) ? duration : undefined,
  };
}

/** The one file an app commits: Vercel reads it before the build runs. */
export function vercelFiles(options: VercelConfigOptions): Record<string, string> {
  return { 'vercel.json': `${JSON.stringify(vercelConfig(options), null, 2)}\n` };
}

const KB = 1024;

/**
 * Writes `vercel.json` if it is missing, then builds the deployment into
 * `.vercel/output`. Two jobs, one command: the config is a source file (Vercel
 * reads it to know how to build), the output is build product — which is why the
 * config it writes calls this command again from `buildCommand`.
 */
export async function runVercelInit(argv: string[], root: string): Promise<void> {
  const app = await resolveAppConfig(root);
  const args = parseVercelArgs(argv);

  for (const [path, contents] of Object.entries(vercelFiles({ output: app.output, ...args }))) {
    const existed = existsSync(join(root, path));

    await Bun.write(join(root, path), contents);
    console.log(`janux-vercel: ${existed ? 'updated' : 'wrote'} ${path}`);
  }
  const bytes = await writeVercelOutput(root, app, args);

  if (bytes > 0) console.log(`janux-vercel: bundled the app (${Math.round(bytes / KB)} KB)`);
  console.log(`janux-vercel: wrote .vercel/output (output: ${app.output}).`);
}
