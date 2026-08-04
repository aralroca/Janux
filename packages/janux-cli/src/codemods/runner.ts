import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { unifiedDiff } from './diff';
import type { Codemod } from './types';

/**
 * Running a set of codemods over an app: plan first, then apply.
 *
 * The split is the whole point. `planCodemods` reads and decides, touching
 * nothing, so `--dry-run` is not a second code path that might disagree with
 * the real one — it is the same plan, rendered instead of written. A codemod
 * that can only be trusted after it has run is not one anybody runs.
 */

/** Neither source nor ours: dependencies, build output and VCS metadata. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.vercel', '.astro', '.turbo']);
/** Files a codemod could conceivably read; the rest are assets it has no opinion on. */
const CANDIDATE = /\.([cm]?[jt]sx?|astro|css|scss|mdx?)$/;

/**
 * Every candidate file under the app root, app-relative and forward-slashed.
 *
 * Read as names rather than as `Dirent`s: `Dirent.parentPath` is newer than the
 * Bun floor `engines` declares, and a floor CI exercises is a floor the code has
 * to hold to. The recursive read already answers root-relative paths, so there
 * is nothing to rejoin — `statSync` is only asked about the handful that got
 * past the extension filter, and only so a directory named like a source file
 * cannot reach `readFileSync` and take the whole command down.
 */
export function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((name) => String(name).replaceAll('\\', '/'))
    .filter((path) => CANDIDATE.test(path) && !path.split('/').some((segment) => SKIP_DIRECTORIES.has(segment)))
    .filter((path) => statSync(join(root, path)).isFile());
}

export interface PlannedChange {
  /** The file as it is on disk today, app-relative. */
  file: string;
  before: string;
  /** Its contents afterwards — the same string as `before` when only the path changes. */
  after: string;
  /** Where it ends up, absent when it stays put. */
  moveTo?: string;
  /** What no codemod could do for this file. */
  notes: string[];
}

/** What the codemods run so far have decided about one file. */
interface Folded {
  after: string;
  moveTo?: string;
  notes: string[];
}

/**
 * One codemod's answer, folded onto the previous ones — so the second codemod
 * reads the first one's output rather than the file on disk, which is what lets
 * `next/routes` decide where a file goes and `next/imports` edit what by then is
 * the same file.
 */
function fold(state: Folded, codemod: Codemod, file: string): Folded {
  const result = codemod.run({ code: state.after, file });

  return {
    after: result.code ?? state.after,
    moveTo: result.moveTo ?? state.moveTo,
    notes: [...state.notes, ...(result.notes ?? [])],
  };
}

/** One file, folded through every codemod that has something to say about it. */
function planFile(codemods: Codemod[], file: string, before: string): PlannedChange | undefined {
  const applicable = codemods.filter((codemod) => codemod.appliesTo(file));
  const planned = applicable.reduce<Folded>((state, codemod) => fold(state, codemod, file), { after: before, notes: [] });
  const moved = planned.moveTo !== undefined && planned.moveTo !== file;

  if (planned.after === before && !moved && planned.notes.length === 0) return undefined;

  return { file, before, ...planned };
}

/** What these codemods would do to this app, having written nothing. */
export function planCodemods(codemods: Codemod[], root: string): PlannedChange[] {
  return sourceFiles(root).flatMap((file) => planFile(codemods, file, readFileSync(join(root, file), 'utf8')) ?? []);
}

/** One file's section of the dry run: what moves, what changes, what is left to do by hand. */
function renderChange(change: PlannedChange): string[] {
  const move = change.moveTo && change.moveTo !== change.file ? [`${change.file} → ${change.moveTo}`] : [];
  const diff = unifiedDiff(change.before, change.after, change.moveTo ?? change.file);
  const notes = change.notes.map((note) => `  ! ${change.file}: ${note}`);

  return [...move, ...(diff ? [diff] : []), ...notes];
}

/** The plan, as a human reads it. */
export function renderPlan(plan: PlannedChange[]): string {
  if (plan.length === 0) return 'Nothing to do.\n';

  return `${plan.flatMap(renderChange).join('\n')}\n`;
}

/** Writes the plan, and answers how many files it touched. */
export function applyPlan(plan: PlannedChange[], root: string): number {
  const written = plan.filter((change) => change.after !== change.before || (change.moveTo && change.moveTo !== change.file));

  written.forEach((change) => write(change, root));

  return written.length;
}

function write(change: PlannedChange, root: string): void {
  const moving = change.moveTo && change.moveTo !== change.file;
  const target = join(root, change.moveTo ?? change.file);

  // A half-migrated tree is the normal state of a migration, so a destination
  // that already holds something is reachable — and silently replacing it is
  // the one outcome the dry run could not have shown.
  if (moving && existsSync(target)) {
    throw new Error(`janux codemod: ${change.file} moves onto ${change.moveTo}, which already exists — resolve it and run again.`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, change.after);
  if (moving) rmSync(join(root, change.file));
}
