import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CliCommand } from './args';
import { CODEMODS, codemodById, codemodsBetween } from './codemods/registry';
import { applyPlan, planCodemods, renderPlan } from './codemods/runner';
import type { Codemod } from './codemods/types';

/**
 * `janux upgrade` and `janux codemod` — the tool the stability contract owes.
 *
 * A 0.x that breaks on a minor and leaves the migration to the reader is
 * charging its users for its own freedom to move. `STABILITY.md` says a
 * deprecated export warns before it goes; this is the other half: for the
 * breaks that cannot be deprecated, the change comes with the thing that
 * applies it.
 *
 * Both commands write by default and both take `--dry-run`, which renders the
 * same plan instead of writing it — not a second code path, the same one.
 */

function readPackage(file: string): Record<string, string> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The Janux the app actually resolves, which is the version its source was written against. */
export function installedJanuxVersion(root: string): string | undefined {
  return readPackage(join(root, 'node_modules/janux/package.json'))?.version;
}

/**
 * The version of the CLI being run — the version the app is moving *to*. Found
 * by name rather than by depth, because this module sits one directory deeper
 * once it has been compiled into `dist`.
 */
function cliVersion(): string | undefined {
  const candidates = ['..', '../..'].map((up) => join(import.meta.dirname, up, 'package.json'));

  return candidates.map(readPackage).find((found) => found?.name === '@janux/cli')?.version;
}

/** Runs a set of codemods over the app, or shows what it would do. */
function execute(codemods: Codemod[], { root, dryRun }: CliCommand): void {
  const plan = planCodemods(codemods, root);

  console.log(renderPlan(plan));
  if (dryRun) return console.log('Dry run: nothing written. Drop --dry-run to apply.');
  const written = applyPlan(plan, root);

  console.log(`${written} file${written === 1 ? '' : 's'} written.`);
}

export function upgrade(parsed: CliCommand): void {
  const from = parsed.from ?? installedJanuxVersion(parsed.root);
  const to = parsed.to ?? cliVersion();

  if (!from) return console.log('janux upgrade: no `janux` installed to read a version from — pass --from <version>.');
  if (!to) return console.log('janux upgrade: could not read the CLI version — pass --to <version>.');
  const codemods = codemodsBetween(from, to);

  if (codemods.length === 0) return console.log(`Nothing to migrate: no codemod applies between ${from} and ${to}.`);
  console.log(`Upgrading ${from} → ${to}: ${codemods.map((codemod) => codemod.id).join(', ')}\n`);
  execute(codemods, parsed);
}

/** The catalog, as `--list` prints it: what each codemod is for, and what it is called. */
function catalog(): string {
  return CODEMODS.map((codemod) => `  ${codemod.id.padEnd(24)} ${codemod.title} — ${codemod.description}`).join('\n');
}

export function codemodCommand(parsed: CliCommand): void {
  const [id] = parsed.files;

  const usage = `Codemods:\n${catalog()}\n\nRun one with: janux codemod <id> [--dry-run]; list them again with janux codemod --list.`;

  if (parsed.list || !id) return console.log(usage);
  const codemod = codemodById(id);

  if (!codemod) return console.log(`janux codemod: no codemod called "${id}".\n\nCodemods:\n${catalog()}`);
  console.log(`${codemod.id}: ${codemod.description}\n`);
  execute([codemod], parsed);
}
