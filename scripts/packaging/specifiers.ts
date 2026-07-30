/**
 * Adds the extension Node needs to every relative specifier, in `.js` and in
 * `.d.ts` alike.
 *
 * The spans come from `@swc/core` rather than a regex because a specifier is a
 * string literal and strings are where regexes stop being able to tell code
 * from prose. They are byte offsets into the file and the sources are not all
 * ASCII, so the splice happens on bytes.
 */
import { parseSync } from '@swc/core';

interface Literal {
  span: { start: number; end: number };
  value: string;
  raw?: string;
}

export interface RewriteOptions {
  /** `'./dir'` → `'./dir/index.js'`, or undefined when nothing is there. */
  resolve: (specifier: string) => string | undefined;
  /** Declarations are TypeScript, never TSX — `<` in a `.d.ts` is a type argument. */
  dts?: boolean;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

const RELATIVE = /^\.\.?\//;
const HAS_EXTENSION = /\.[a-z]+$/i;

/** The specifier this node carries, if it carries one at all. */
function own(node: Record<string, any>): Literal[] {
  if (node.source?.type === 'StringLiteral') return [node.source];
  if (node.type === 'TsImportType' && node.argument?.type === 'StringLiteral') return [node.argument];
  if (node.type === 'CallExpression' && node.callee?.type === 'Import') {
    return node.arguments[0]?.expression?.type === 'StringLiteral' ? [node.arguments[0].expression] : [];
  }

  return [];
}

/** Every specifier literal in the tree: static, `export … from`, dynamic and `import('…')` types. */
function specifiers(node: unknown): Literal[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(specifiers);
  const record = node as Record<string, any>;

  return [...own(record), ...Object.values(record).flatMap(specifiers)];
}

function replacement(literal: Literal, resolve: RewriteOptions['resolve']): string | undefined {
  if (!RELATIVE.test(literal.value) || HAS_EXTENSION.test(literal.value)) return undefined;
  const resolved = resolve(literal.value);

  if (!resolved) throw new Error(`nothing to resolve '${literal.value}' to`);

  return resolved;
}

/** Right to left, so an earlier splice never moves a later span. */
function splice(source: Buffer, edits: Edit[]): Buffer {
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((bytes, { start, end, text }) => Buffer.concat([bytes.subarray(0, start), Buffer.from(text), bytes.subarray(end)]), source);
}

function sits(bytes: Buffer, literal: Literal, base: number): boolean {
  return bytes.subarray(literal.span.start - base, literal.span.end - base).toString() === literal.raw;
}

/**
 * Where the file starts in SWC's numbering.
 *
 * `Program.span.start` is the first *statement*, so it is past any leading
 * comment and cannot be used for this. The base is derived from a literal whose
 * bytes are known instead, and accepted only when it holds for every literal —
 * a wrong base then fails loudly rather than splicing into a comment.
 */
function spanBase(bytes: Buffer, literals: Literal[]): number {
  const first = literals[0]!;
  const needle = Buffer.from(first.raw ?? '');

  for (let at = bytes.indexOf(needle); at !== -1; at = bytes.indexOf(needle, at + 1)) {
    const base = first.span.start - at;

    if (literals.every((literal) => sits(bytes, literal, base))) return base;
  }

  throw new Error(`cannot place ${first.raw} in its own file — SWC span numbering changed`);
}

export function rewriteSpecifiers(code: string, { resolve, dts = false }: RewriteOptions): string {
  const program = parseSync(code, { syntax: 'typescript', tsx: !dts, target: 'esnext', comments: true });
  const literals = specifiers(program.body);
  const resolved = literals.map((literal) => ({ literal, text: replacement(literal, resolve) }));
  const rewritten = resolved.filter((edit): edit is { literal: Literal; text: string } => edit.text !== undefined);

  if (rewritten.length === 0) return code;
  const bytes = Buffer.from(code);
  const base = spanBase(bytes, literals);
  const edits = rewritten.map(({ literal, text }) => ({
    start: literal.span.start - base,
    end: literal.span.end - base,
    text: `${literal.raw?.[0] ?? "'"}${text}${literal.raw?.[0] ?? "'"}`,
  }));

  return splice(bytes, edits).toString();
}
