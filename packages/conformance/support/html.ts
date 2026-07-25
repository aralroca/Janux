import { expect } from 'bun:test';
import { renderToString } from 'janux';
import type { Case } from './case';
import { runCases } from './scenario';

/** A tree case: build the node lazily so each row renders fresh. */
export interface TreeCase {
  node: () => unknown;
  /** Exactly the HTML `renderToString` must produce. */
  expected: string;
}

export type TreeRow = Case<TreeCase>;

/** Shared by the element corpus and the raw-sink corpus, which assert identically. */
export function runTreeCases(table: TreeRow[]): void {
  runCases(table, async (row) => {
    const { html } = await renderToString(row.node());

    expect(html).toBe(row.expected);
  });
}
