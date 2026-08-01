import { describe, expect } from 'bun:test';
import { hashKey } from 'janux/query';
import { runCases } from '../support/scenario';
import { HASH_BOUNDARY_CASES } from './hash-key-boundaries.cases';

describe('query key hashing at the serialization boundary', () =>
  runCases(HASH_BOUNDARY_CASES, (row) => {
    expect(hashKey(row.left) === hashKey(row.right)).toBe(row.same);
  }));
