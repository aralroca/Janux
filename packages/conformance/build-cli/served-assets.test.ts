import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import { CACHE_CASES, CACHE_HEADERS, TYPE_CASES, cacheControl, contentType } from './served-assets.cases';

describe('cache headers for a built asset', () =>
  runCases(CACHE_CASES, (row) => {
    expect(cacheControl(row.path)).toBe(row.immutable ? CACHE_HEADERS.immutable : CACHE_HEADERS.revalidate);
  }));

describe('content types for a built asset', () =>
  runCases(TYPE_CASES, (row) => {
    expect(contentType(row.path)).toBe(row.type);
  }));
