import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { FUNCTION_PATH, vercelConfig, type VercelConfigOptions } from './index';

/** The `api/index.ts` a server app deploys: the handler, and nothing else. */
const FUNCTION_ENTRY = `import { createHandler } from '@janux/vercel';

export default createHandler();
`;

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

/** The files a Vercel deployment needs, from the app's own config. */
export function vercelFiles(options: VercelConfigOptions): Record<string, string> {
  const config = `${JSON.stringify(vercelConfig(options), null, 2)}\n`;

  if (options.output === 'static') return { 'vercel.json': config };

  return { 'vercel.json': config, [FUNCTION_PATH]: FUNCTION_ENTRY };
}

/**
 * Writes them into the app. Both files are deployment sources, not build
 * output: Vercel reads `vercel.json` before it runs the build, and the function
 * entry has to exist for the runtime to find it — which is why this is a
 * command an app runs once and commits, not a step in `janux build`.
 */
export async function runVercelInit(argv: string[], root: string): Promise<void> {
  const { output } = await resolveAppConfig(root);
  const files = vercelFiles({ output, ...parseVercelArgs(argv) });

  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    const existed = existsSync(target);

    await Bun.write(target, contents);
    console.log(`janux-vercel: ${existed ? 'updated' : 'wrote'} ${path}`);
  }
  console.log(`janux-vercel: ready for \`vercel deploy\` (output: ${output}).`);
}
