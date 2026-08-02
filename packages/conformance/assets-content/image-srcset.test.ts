import { describe, expect } from 'bun:test';
import { imageSrcSet } from '../../janux/src/image/urls';
import { runCases } from '../support/scenario';
import { SRCSET_CASES } from './image-srcset.cases';

describe('srcset attribute composition', () =>
  runCases(SRCSET_CASES, (row) => {
    expect(imageSrcSet(row.path, row.widths, row.format)).toBe(row.expected);
  }));
