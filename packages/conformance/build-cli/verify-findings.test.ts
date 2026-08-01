import { describe, expect, it } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  AUDIT_MESSAGE_CASES,
  FAILING_ROUTE_PATTERN,
  FINDINGS_CASES,
  auditManifest,
  collectFindings,
  type RouteManifest,
} from './verify-findings.cases';

/** A route renders when the case gave it tools, and throws when it did not. */
function manifestFor(routes: RouteManifest[]) {
  return async (pattern: string): Promise<unknown> => {
    const route = routes.find((candidate) => candidate.pattern === pattern);

    if (!route?.tools) throw new Error(`render failed: ${pattern}`);

    return { tools: route.tools };
  };
}

describe('verify finding messages', () =>
  runCases(AUDIT_MESSAGE_CASES, (row) => {
    const findings = auditManifest({ tools: row.tools as never });

    expect(findings.map((finding) => finding.message)).toEqual(row.messages);
  }));

describe('verify across an app', () =>
  runCases(FINDINGS_CASES, async (row) => {
    const findings = await collectFindings(
      row.routes.map((route) => route.pattern),
      manifestFor(row.routes),
    );

    expect(findings.map((finding) => `${finding.level}:${finding.tool ?? '-'}`)).toEqual(row.expected);
  }));

describe('a route that failed to render', () => {
  it('is named in the warning, so it can be opened', async () => {
    const [warning] = await collectFindings([FAILING_ROUTE_PATTERN], manifestFor([]));

    expect(warning?.level).toBe('warn');
    expect(warning?.message).toContain(FAILING_ROUTE_PATTERN);
    // The distinction that matters: only errors set the exit code, so a route
    // nobody could render must not be reported as one.
    expect(warning?.tool).toBeUndefined();
  });
});
