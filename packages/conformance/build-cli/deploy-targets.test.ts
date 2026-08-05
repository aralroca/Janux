import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  CAPABILITY_CASES,
  VERCEL_ARGS_CASES,
  VERCEL_CONFIG_CASES,
  parseVercelArgs,
  unsupportedFeatures,
  vercelConfig,
} from './deploy-targets.cases';

describe('what a target cannot serve', () =>
  runCases(CAPABILITY_CASES, (row) => {
    const config = {
      websocketModule: row.websocketModule ? '/app/src/ws.ts' : undefined,
      schedulesDir: row.schedulesDir ? '/app/src/schedules' : undefined,
      output: row.output ?? 'bun',
      redirects: Array.from({ length: row.routingRules ?? 0 }, () => ({ from: '/old', to: '/new' })),
    };
    const gaps = unsupportedFeatures(config as never, row.capabilities);

    // The feature, not the flag: an app author reads this, not an adapter author.
    expect(gaps.length).toBe(row.gaps.length);
    row.gaps.forEach((feature, index) => expect(gaps[index]).toContain(feature));
  }));

describe('the vercel.json a Janux app commits', () =>
  runCases(VERCEL_CONFIG_CASES, (row) => {
    const config = vercelConfig(row.options) as Record<string, unknown>;

    Object.entries(row.expected).forEach(([field, value]) => {
      expect(config[field]).toEqual(value);
    });
  }));

describe('janux-vercel arguments', () =>
  runCases(VERCEL_ARGS_CASES, (row) => {
    expect(parseVercelArgs(row.argv)).toEqual(row.expected);
  }));
