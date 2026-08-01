import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import { INFO_CASES, renderInfoMarkdown } from './info-report.cases';

describe('the markdown janux info prints', () =>
  runCases(INFO_CASES, (row) => {
    const markdown = renderInfoMarkdown(row.info);

    row.lines.forEach((line) => expect(markdown).toContain(line));
    row.never?.forEach((absent) => expect(markdown).not.toContain(absent));
  }));
