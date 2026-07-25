import { describe, expect } from 'bun:test';
import { hashKey } from 'janux/query';
import { runCases } from '../support/scenario';
import { HASH_CASES } from './hash-key.cases';

describe('query key hashing', () =>
  runCases(HASH_CASES, (row) => {
    expect(hashKey(row.left) === hashKey(row.right)).toBe(row.same);
  }));
