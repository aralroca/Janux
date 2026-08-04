import { posix } from 'node:path';
import { applyEdits, collect, parseModule, spanOf, textOf, type SpanEdit } from './ast';

/**
 * Moving a file breaks every relative specifier in it — and pointing them back
 * at where the neighbour *used* to be is not a fix, because in a real migration
 * the neighbour moved too. So the rebase runs the specifier's target through
 * the same move plan the file itself went through, then re-relativizes: the
 * import ends up naming where that module actually lives afterwards.
 *
 * Files that do not move map to themselves, which is what keeps an import
 * reaching outside the migrated tree (`../../lib/db`) pointing at `lib/db`.
 */

/** Only relative specifiers are ours: a bare or aliased one resolves the same from anywhere. */
const RELATIVE = /^\.\.?\//;

export interface MovePlan {
  /** The file's path before the move, app-relative. */
  from: string;
  /** Its path afterwards. */
  to: string;
  /** Where any other app-relative path ends up — identity for files that stay. */
  mapPath: (path: string) => string;
}

const SPECIFIER_HOLDERS = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'];

/** Every string literal in the file that names a module. */
function specifierNodes(module: any): any[] {
  const declared = SPECIFIER_HOLDERS.flatMap((type) => collect(module, type)).map((node) => node.source);
  const dynamic = collect(module, 'CallExpression')
    .filter((call) => call.callee?.type === 'Import')
    .map((call) => call.arguments?.[0]?.expression);

  return [...declared, ...dynamic].filter((node) => node?.type === 'StringLiteral');
}

/** Where the specifier has to point from the new location. */
function rebased(specifier: string, { from, to, mapPath }: MovePlan): string {
  const target = mapPath(posix.normalize(posix.join(posix.dirname(from), specifier)));
  const next = posix.relative(posix.dirname(to), target);

  return next.startsWith('.') ? next : `./${next}`;
}

/** The literal, rewritten in the quote style the file already used. */
function requoted(original: string, value: string): string {
  const quote = original.startsWith('"') ? '"' : "'";

  return `${quote}${value}${quote}`;
}

function editFor(code: string, node: any, base: number, move: MovePlan): SpanEdit[] {
  const original = textOf(code, node, base);
  const next = rebased(node.value, move);

  if (next === node.value) return [];

  return [{ ...spanOf(node, base), text: requoted(original, next) }];
}

/**
 * The source with its relative specifiers rebased, or `undefined` when none had
 * to change — which is also the answer on a second run, since the file is then
 * already at `to`.
 */
export function rebaseRelativeImports(code: string, move: MovePlan): string | undefined {
  const parsed = move.from === move.to ? undefined : parseModule(code, move.from);

  if (!parsed) return undefined;
  const edits = specifierNodes(parsed.module)
    .filter((node) => RELATIVE.test(node.value))
    .flatMap((node) => editFor(code, node, parsed.base, move));

  return edits.length > 0 ? applyEdits(code, edits) : undefined;
}
