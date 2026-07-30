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

/**
 * A first statement whose byte position is known, prepended so the span base can
 * be *read off* it rather than searched for.
 *
 * Searching does not work: `Program.span.start` is the first statement, so it is
 * past any leading comment, and looking for a literal's own bytes is ambiguous
 * the moment the comment above an import quotes the specifier — every literal
 * then sits correctly at the wrong base too, and the only edit lands in the
 * prose. A NUL byte cannot occur in source, so this cannot be confused with
 * anything in the file.
 */
const SENTINEL = 'import "\0janux-span-base";\n';
const SENTINEL_AT = SENTINEL.indexOf('"');

function sits(bytes: Buffer, literal: Literal, offset: number): boolean {
  return bytes.subarray(literal.span.start - offset, literal.span.end - offset).toString() === literal.raw;
}

/** Byte offset that maps a SWC span onto `body`. */
function spanOffset(bytes: Buffer, literals: Literal[]): number {
  const [sentinel, ...rest] = literals;
  const offset = sentinel!.span.start - SENTINEL_AT + SENTINEL.length;
  const misplaced = rest.find((literal) => !sits(bytes, literal, offset));

  if (!sentinel!.value.startsWith('\0')) throw new Error('SWC no longer reports specifiers in source order');
  if (misplaced) throw new Error(`cannot place ${misplaced.raw} in its own file — SWC span numbering changed`);

  return offset;
}

export function rewriteSpecifiers(code: string, { resolve, dts = false }: RewriteOptions): string {
  const shebang = code.startsWith('#!') ? `${code.slice(0, code.indexOf('\n'))}\n` : '';
  const body = code.slice(shebang.length);
  const program = parseSync(SENTINEL + body, { syntax: 'typescript', tsx: !dts, target: 'esnext', comments: true });
  const literals = specifiers(program.body);
  const rewritten = literals
    .slice(1)
    .map((literal) => ({ literal, text: replacement(literal, resolve) }))
    .filter((edit): edit is { literal: Literal; text: string } => edit.text !== undefined);

  if (rewritten.length === 0) return code;
  const bytes = Buffer.from(body);
  const offset = spanOffset(bytes, literals);
  const edits = rewritten.map(({ literal, text }) => ({
    start: literal.span.start - offset,
    end: literal.span.end - offset,
    text: `${literal.raw?.[0] ?? "'"}${text}${literal.raw?.[0] ?? "'"}`,
  }));

  return `${shebang}${splice(bytes, edits).toString()}`;
}
