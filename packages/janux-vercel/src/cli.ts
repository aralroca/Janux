import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { BUNDLE_PATH, buildFunction } from './build';
import { FUNCTION_PATH, vercelConfig, type VercelConfigOptions } from './index';

/** The function Vercel invokes: the bundle, and nothing it has to resolve. */
const FUNCTION_ENTRY = `export { default } from '../${BUNDLE_PATH}';\n`;

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

const KB = 1024;

/**
 * `vercel.json` is a deployment *source* — Vercel reads it before it runs the
 * build — so it is committed. The bundle under `.janux/` is build output, which
 * is why this command runs inside the build command too. Running it again is
 * always safe.
 */
export async function runVercelInit(argv: string[], root: string): Promise<void> {
  const app = await resolveAppConfig(root);
  const files = vercelFiles({ output: app.output, ...parseVercelArgs(argv) });

  for (const [path, contents] of Object.entries(files)) {
    const existed = existsSync(join(root, path));

    await Bun.write(join(root, path), contents);
    console.log(`janux-vercel: ${existed ? 'updated' : 'wrote'} ${path}`);
  }
  if (app.output !== 'static') {
    const bytes = await buildFunction(root, app);

    console.log(`janux-vercel: bundled ${BUNDLE_PATH} (${Math.round(bytes / KB)} KB)`);
  }
  console.log(`janux-vercel: ready for \`vercel deploy\` (output: ${app.output}).`);
}
