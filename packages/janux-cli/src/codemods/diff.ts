/**
 * A unified diff, so `--dry-run` shows the change rather than describing it.
 *
 * A codemod asks to be trusted with someone's source tree, and the only honest
 * basis for that is the diff it would write. Reading it should cost the same as
 * reading a `git diff`, which is why this is the same format down to the hunk
 * headers.
 */

/** Lines of context kept either side of a change, matching `diff -U3`. */
const CONTEXT = 3;

type Op = ' ' | '-' | '+';

interface Line {
  op: Op;
  text: string;
  /** 1-based line numbers, absent on the side the line is not on. */
  before?: number;
  after?: number;
}

/** Trailing-newline-tolerant split: a file ending in `\n` is not a file with a trailing empty line. */
function lines(text: string): string[] {
  const split = text.split('\n');

  return split.at(-1) === '' ? split.slice(0, -1) : split;
}

/** Length of the longest common subsequence for every suffix pair. */
function lcsTable(before: string[], after: string[]): number[][] {
  const table = Array.from({ length: before.length + 1 }, () => new Array(after.length + 1).fill(0));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i]![j] = before[i] === after[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  return table;
}

/**
 * The edit script, walking the table from the top-left corner.
 *
 * The two loops here and in `lcsTable` are the one place in this package that
 * is written imperatively on purpose: dynamic programming over a matrix, and a
 * two-cursor walk back through it, are what the algorithm *is*. Expressing
 * either as a fold would cost the reader the shape and buy nothing.
 */
function script(before: string[], after: string[]): Line[] {
  const table = lcsTable(before, after);
  const out: Line[] = [];

  for (let i = 0, j = 0; i < before.length || j < after.length; ) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      out.push({ op: ' ', text: before[i]!, before: ++i, after: ++j });
      // Strictly greater, so a replacement reads `-old` then `+new`: on a tie
      // the deletion goes first, which is the order every diff reader expects.
    } else if (j < after.length && (i === before.length || table[i]![j + 1]! > table[i + 1]![j]!)) {
      out.push({ op: '+', text: after[j]!, after: ++j });
    } else {
      out.push({ op: '-', text: before[i]!, before: ++i });
    }
  }

  return out;
}

/** Indices of the lines a hunk must show: every change, plus its context. */
function shown(script: Line[]): Set<number> {
  const changed = script.flatMap((line, index) => (line.op === ' ' ? [] : [index]));

  return new Set(changed.flatMap((index) => Array.from({ length: CONTEXT * 2 + 1 }, (_, step) => index - CONTEXT + step)));
}

/** Runs of consecutive shown indices — one hunk each. */
function hunks(script: Line[]): Line[][] {
  const keep = shown(script);

  return script.reduce<Line[][]>((groups, line, index) => {
    if (!keep.has(index)) return groups;
    const previous = keep.has(index - 1) ? groups.at(-1) : undefined;

    return previous ? [...groups.slice(0, -1), [...previous, line]] : [...groups, [line]];
  }, []);
}

/** `@@ -start,count +start,count @@` for one hunk. */
function header(hunk: Line[]): string {
  const side = (op: Op, key: 'before' | 'after') => {
    const numbers = hunk.filter((line) => line.op !== op).map((line) => line[key]!);

    return `${numbers[0] ?? 0},${numbers.length}`;
  };

  return `@@ -${side('+', 'before')} +${side('-', 'after')} @@`;
}

/** The diff between two versions of one file, empty when they are the same. */
export function unifiedDiff(before: string, after: string, path: string): string {
  if (before === after) return '';
  const edits = script(lines(before), lines(after));
  const body = hunks(edits).flatMap((hunk) => [header(hunk), ...hunk.map((line) => `${line.op}${line.text}`)]);

  return [`--- a/${path}`, `+++ b/${path}`, ...body, ''].join('\n');
}
