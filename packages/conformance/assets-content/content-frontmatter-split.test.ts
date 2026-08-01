import { describe, expect } from 'bun:test';
import { splitFrontmatter } from '../../janux-content/src/frontmatter';
import { runCases } from '../support/scenario';
import { SPLIT_CASES, SPLIT_ERROR_CASES } from './content-frontmatter-split.cases';

describe('frontmatter split', () =>
  runCases(SPLIT_CASES, (row) => {
    expect(splitFrontmatter(row.source)).toEqual({ yaml: row.yaml, body: row.body });
  }));

describe('frontmatter split refusals', () =>
  runCases(SPLIT_ERROR_CASES, (row) => {
    expect(() => splitFrontmatter(row.source)).toThrow(row.expected);
  }));
