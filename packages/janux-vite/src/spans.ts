import { parseSync } from '@swc/core';

/**
 * Span-based splicing over SWC parses, shared by the compiler transforms.
 * Spans are byte offsets with a per-process global base — the base is read
 * off a prepended sentinel import rather than searched for (see
 * scripts/packaging/specifiers.ts, where the technique comes from, for why
 * searching is ambiguous).
 */

export interface Span {
  start: number;
  end: number;
}

export interface Edit extends Span {
  text: string;
}

const SENTINEL = 'import "\0janux-span-base";\n';
const SENTINEL_AT = SENTINEL.indexOf('"');

export interface SpannedModule {
  body: any[];
  /** Subtract from any span to get a byte offset into the original code. */
  offset: number;
}

/** Parses with the sentinel prepended; undefined when the module does not parse. */
export function parseWithSpanBase(code: string, tsx: boolean): SpannedModule | undefined {
  try {
    const program = parseSync(SENTINEL + code, { syntax: 'typescript', tsx });
    const sentinelStart = (program.body[0] as any)?.source?.span.start;

    if (typeof sentinelStart !== 'number') return undefined;

    return { body: program.body as any[], offset: sentinelStart - SENTINEL_AT + SENTINEL.length };
  } catch {
    return undefined;
  }
}

/** Right to left, so an earlier splice never moves a later span. */
export function splice(source: Buffer, edits: Edit[]): Buffer {
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (bytes, { start, end, text }) => Buffer.concat([bytes.subarray(0, start), Buffer.from(text), bytes.subarray(end)]),
      source,
    );
}

/** The original bytes a span covers. */
export function sliceSpan(bytes: Buffer, span: Span, offset: number): string {
  return bytes.subarray(span.start - offset, span.end - offset).toString();
}
