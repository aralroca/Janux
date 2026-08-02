import { describe, expect } from 'bun:test';
import { parseVariantUrl } from '../../janux/src/image/urls';
import { runCases } from '../support/scenario';
import { VARIANT_PARSE_CASES } from './image-variant-parse.cases';

describe('variant url parsing', () =>
  runCases(VARIANT_PARSE_CASES, (row) => {
    expect(parseVariantUrl(row.pathname)).toEqual(row.expected);
  }));
