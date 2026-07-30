/**
 * The `AdapterBuilder` an adapter's `adapt()` is handed.
 *
 * Everything here used to live inside `@janux/vercel`, which meant a second
 * adapter had to either depend on the first or copy it. It is the same code —
 * generalised over the bundler target and over which adapter's entry is being
 * written.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveAppConfig, type JanuxAppConfig } from '@janux/vite/config';
import { generateApp } from './adapter-generate';
import type { AdapterBuilder, AdapterEntry, JanuxAdapter } from './adapter';

/** Where the generated app module and entry are written, beside the app rather than inside `src/`. */
export const GENERATED_DIR = '.janux';

/**
 * The bundler runs as its own process so it can use the app as its working
 * directory: `Bun.build` resolves packages from the working directory, not from
 * the importer. It is therefore found by name — and the name depends on where
 * this package is running from: source in the workspace, compiled `dist/` once
 * published.
 */
export function bundlerPath(exists: (path: string) => boolean = existsSync): string {
  const found = ['bundler.ts', 'bundler.js'].map((name) => join(import.meta.dirname, name)).find(exists);

  if (!found) throw new Error('janux: the adapter bundler is missing next to this module');

  return found;
}

/**
 * `JANUX_APP_ROOT` is set before the app is imported, not after: a module that
 * locates its own data files (`join(import.meta.dirname, '../../content')` — the
 * docs site's markdown) does it at import time, and inside a bundle
 * `import.meta.dirname` is the bundle's directory, not the source file's. The
 * app import is dynamic for that reason: a static one would be hoisted above the
 * assignment and read an empty root.
 */
function entrySource({ imports, body }: AdapterEntry): string {
  return [
    "import { join } from 'node:path';",
    ...imports,
    '',
    "process.env.JANUX_APP_ROOT = join(import.meta.dirname, '..');",
    "const { default: app } = await import('./app');",
    '',
    body,
    '',
  ].join('\n');
}

async function write(path: string, contents: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

export function createAdapterBuilder(root: string, config: JanuxAppConfig, name: string): AdapterBuilder {
  return {
    root,
    config,
    clientDir: join(root, 'dist/client'),

    writeEntry: async (entry) => {
      await write(join(root, GENERATED_DIR, 'app.ts'), generateApp(root, config, name));
      await write(join(root, GENERATED_DIR, 'entry.ts'), entrySource(entry));
    },

    bundle: async (outfile, target) => {
      const entry = `${GENERATED_DIR}/entry.ts`;
      const built = Bun.spawnSync(['bun', bundlerPath(), entry, outfile, target], { cwd: root });

      if (!built.success) throw new Error(`${name}: could not bundle the app\n${built.stderr.toString()}`);

      return Bun.file(join(root, outfile)).size;
    },

    write: (path, contents) => write(join(root, path), contents),

    copyDir: (from, to) => {
      if (!existsSync(join(root, from))) return false;
      mkdirSync(join(root, to), { recursive: true });
      cpSync(join(root, from), join(root, to), { recursive: true });

      return true;
    },

    copyClient: (to) => {
      const from = join(root, 'dist/client');

      if (!existsSync(from)) throw new Error(`${name}: ${from} is missing — run \`janux build\` first`);
      mkdirSync(join(root, to), { recursive: true });
      cpSync(from, join(root, to), { recursive: true });
    },

    log: (message) => console.log(`${name}: ${message}`),
  };
}

/** Resolves the app and runs the adapter over it — what every adapter's CLI does. */
export async function runAdapter(adapter: JanuxAdapter, root: string): Promise<void> {
  const config = await resolveAppConfig(root);

  await adapter.adapt(createAdapterBuilder(root, config, adapter.name));
}
