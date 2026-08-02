import { describe, expect } from 'bun:test';
import { collectHeadings, type Heading } from '../../janux-content/src/headings';
import { runCases } from '../support/scenario';
import { HEADING_CASES, type HeadingNode } from './content-headings.cases';

describe('heading collection', () =>
  runCases(HEADING_CASES, (row) => {
    const headings: Heading[] = [];
    const tree = structuredClone(row.tree) as HeadingNode;

    collectHeadings(headings)()(tree as never);

    expect(headings).toEqual(row.expected);
    // The ids the plugin stamped are the ones the TOC just linked to.
    const stamped = (tree.children ?? []).map((child) => (child.properties?.id as string | undefined) ?? null);

    expect(stamped).toEqual(row.stamped);
  }));
