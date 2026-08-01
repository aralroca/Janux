import { describe, expect } from 'bun:test';
import { variantUrl } from '../../janux/src/image/urls';
import { runCases } from '../support/scenario';
import { VARIANT_URL_CASES } from './image-variant-url.cases';

describe('variant url encoding', () =>
  runCases(VARIANT_URL_CASES, (row) => {
    expect(variantUrl(row.path, row.width, row.format)).toBe(row.expected);
  }));
