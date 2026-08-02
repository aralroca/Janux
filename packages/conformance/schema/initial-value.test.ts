import { describe, expect } from 'bun:test';
import { buildDefault } from 'janux';
import { runCases } from '../support/scenario';
import { INITIAL_VALUE_CASES } from './initial-value.cases';

describe('initial values', () =>
  runCases(INITIAL_VALUE_CASES, (row) => {
    expect(buildDefault(row.type())).toEqual(row.expected);
  }));
