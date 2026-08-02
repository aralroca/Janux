import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import { ARGS_EDGE_CASES, PORT_ERROR_CASES, parseArgs } from './args-edges.cases';

describe('cli argument parsing at the edges', () =>
  runCases(ARGS_EDGE_CASES, (row) => {
    const parsed = parseArgs(row.argv, '/app') as unknown as Record<string, unknown>;

    Object.entries(row.expected).forEach(([field, value]) => {
      expect(parsed[field]).toEqual(value);
    });
  }));

describe('cli port validation', () =>
  runCases(PORT_ERROR_CASES, (row) => {
    expect(() => parseArgs(row.argv, '/app')).toThrow(row.says);
  }));
