import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import { ARGS_CASES, AUDIT_CASES, auditManifest, parseArgs } from './args.cases';

describe('cli argument parsing', () =>
  runCases(ARGS_CASES, (row) => {
    const parsed = parseArgs(row.argv, '/app') as unknown as Record<string, unknown>;

    Object.entries(row.expected).forEach(([field, value]) => {
      expect(parsed[field]).toEqual(value);
    });
  }));

describe('verify contract audit', () =>
  runCases(AUDIT_CASES, (row) => {
    const findings = auditManifest({ tools: row.tools as never });

    expect(findings.map((finding) => finding.tool)).toEqual(row.flagged);
    findings.forEach((finding) => expect(finding.level).toBe('error'));
  }));
