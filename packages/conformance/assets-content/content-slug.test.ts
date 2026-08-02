import { describe, expect } from 'bun:test';
import { slugify } from '../../janux-content/src/headings';
import { runCases } from '../support/scenario';
import { SLUG_CASES } from './content-slug.cases';

describe('heading slugs', () =>
  runCases(SLUG_CASES, (row) => {
    expect(slugify(row.text)).toBe(row.expected);
  }));
