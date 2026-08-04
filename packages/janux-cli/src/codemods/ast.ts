import { parseSync } from '@swc/core';

/**
 * The substrate every codemod is written on: parse with `@swc/core`, decide
 * from the AST, and edit the file by *span* rather than by printing the tree
 * back out.
 *
 * Printing is what makes a codemod hostile. `parse → print` reformats a file
 * the author never asked to reformat and drops the comments the parser did not
 * attach, so a one-attribute rename arrives as a thousand-line diff nobody can
 * review. Splicing the bytes under the nodes that actually changed leaves the
 * rest of the file byte-identical, which is also what makes a second run a
 * no-op: there is nothing left to normalize.
 */

/** A byte-range replacement in the original source. */
export interface SpanEdit {
  start: number;
  end: number;
  text: string;
}

/**
 * A parsed module and the offset its spans are relative to.
 *
 * SWC numbers spans from a source map shared by the whole process, not from
 * the start of the file — `module.span.start` is where this file begins in it.
 * Every position below is rebased through it, so a codemod that parses a
 * hundred files is not reading the hundredth one at the wrong offset.
 */
export interface ParsedModule {
  module: any;
  base: number;
}

/** Files whose JSX mode is not settled by the extension: the repo writes JSX in `.ts` too. */
const JSX_EXTENSION = /\.[jt]sx$/;

/**
 * The module, or `undefined` when it does not parse. A codemod runs over an
 * app it did not write — a file mid-edit, a `.d.ts`, a dialect SWC does not
 * speak — and skipping it is the only correct answer. Both JSX modes are tried
 * because `.ts` files in real apps do contain JSX.
 */
export function parseModule(code: string, file: string): ParsedModule | undefined {
  const modes = JSX_EXTENSION.test(file) ? [true] : [false, true];

  return modes.reduce<ParsedModule | undefined>((found, tsx) => found ?? tryParse(code, tsx), undefined);
}

function tryParse(code: string, tsx: boolean): ParsedModule | undefined {
  try {
    const module: any = parseSync(code, { syntax: 'typescript', tsx });

    return { module, base: module.span.start };
  } catch {
    return undefined;
  }
}

/**
 * Every node in the tree, in document order. An AST for one source file is
 * small enough to flatten, and flattening it is what lets a codemod read as a
 * `filter` over the shapes it cares about instead of a hand-written visitor
 * per node type.
 */
export function nodes(root: any): any[] {
  if (Array.isArray(root)) return root.flatMap(nodes);
  if (!root || typeof root !== 'object') return [];
  const self = typeof root.type === 'string' ? [root] : [];

  return [...self, ...Object.values(root).flatMap(nodes)];
}

/** Every node of one type, anywhere under `root`. */
export function collect(root: any, type: string): any[] {
  return nodes(root).filter((node) => node.type === type);
}

/** A node's byte range in the file, rebased off the module's own start. */
export function spanOf(node: any, base: number): { start: number; end: number } {
  return { start: node.span.start - base, end: node.span.end - base };
}

/** The source under a node — the bytes the parser saw, comments and all. */
export function textOf(code: string, node: any, base: number): string {
  const { start, end } = spanOf(node, base);

  return Buffer.from(code, 'utf8').subarray(start, end).toString('utf8');
}

/**
 * The edits, ordered and proven disjoint. Two codemod rules matching the same
 * range is a bug in the rules; splicing both would produce a file that parses
 * and means something nobody wrote, which is worse than failing.
 */
function ordered(edits: SpanEdit[]): SpanEdit[] {
  const sorted = [...edits].sort((left, right) => left.start - right.start);
  const overlap = sorted.find((edit, index) => index > 0 && edit.start < sorted[index - 1]!.end);

  if (overlap) throw new Error(`janux codemod: overlapping edits at byte ${overlap.start}`);

  return sorted;
}

/**
 * The source with every edit spliced in. Offsets are byte offsets into the
 * original, so a rule never has to know what any other rule did — the whole set
 * is applied against one unshifted coordinate system.
 */
export function applyEdits(code: string, edits: SpanEdit[]): string {
  const bytes = Buffer.from(code, 'utf8');
  const sorted = ordered(edits);
  const spliced = sorted.flatMap((edit, index) => [
    bytes.subarray(index === 0 ? 0 : sorted[index - 1]!.end, edit.start).toString('utf8'),
    edit.text,
  ]);

  return [...spliced, bytes.subarray(sorted.at(-1)?.end ?? 0).toString('utf8')].join('');
}
