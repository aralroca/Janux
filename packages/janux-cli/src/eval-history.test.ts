import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendHistory,
  buildRecord,
  compareRuns,
  comparisonLines,
  readBaseline,
  type RunRecord,
} from './eval-history';
import type { ScenarioReport } from './eval-runner';

const META = { runId: 'run_1', date: '2026-08-03T10:00:00.000Z', commit: 'abc1234', model: 'openrouter/qwen', durationMs: 1200 };

function scenario(name: string, pass: boolean, usage?: { inputTokens: number; outputTokens: number; costUsd?: number }): ScenarioReport {
  return { name, pass, steps: [], ...(usage && { usage }) };
}

function record(runId: string, scenarios: { name: string; passes: boolean[] }[], costUsd?: number): RunRecord {
  return { ...META, runId, trials: scenarios[0]?.passes.length ?? 1, scenarios, usage: { inputTokens: 10, outputTokens: 2, costUsd }, durationMs: 900 };
}

describe('buildRecord — one run, its metadata and its bill', () => {
  it('records per-scenario passes across trials, run totals and the metadata', () => {
    const trials = [
      [scenario('restock', true, { inputTokens: 100, outputTokens: 10, costUsd: 0.002 }), scenario('write-off', false)],
      [scenario('restock', true, { inputTokens: 120, outputTokens: 14, costUsd: 0.003 }), scenario('write-off', false)],
    ];
    const built = buildRecord(trials, META);

    expect(built).toEqual({
      ...META,
      trials: 2,
      scenarios: [
        { name: 'restock', passes: [true, true] },
        { name: 'write-off', passes: [false, false] },
      ],
      usage: { inputTokens: 220, outputTokens: 24, costUsd: 0.005 },
    });
  });

  it('omits usage entirely when no scenario reported any', () => {
    expect(buildRecord([[scenario('restock', true)]], META).usage).toBeUndefined();
  });
});

describe('history file — append and read back, fail-open', () => {
  it('appends one JSONL line per run and the last one is the default baseline', () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-evals-'));

    appendHistory(root, record('run_1', [{ name: 'restock', passes: [true] }]));
    appendHistory(root, record('run_2', [{ name: 'restock', passes: [false] }]));

    expect(readBaseline(root)?.runId).toBe('run_2');
  });

  it('an explicit --baseline file wins over the local history', () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-evals-'));
    const file = join(root, 'baseline.json');

    writeFileSync(file, JSON.stringify(record('run_main', [{ name: 'restock', passes: [true] }])));
    appendHistory(root, record('run_local', [{ name: 'restock', passes: [true] }]));

    expect(readBaseline(root, file)?.runId).toBe('run_main');
  });

  it('never throws: an unwritable root loses the record, not the run', () => {
    expect(() => appendHistory('/dev/null/nope', record('run_1', []))).not.toThrow();
    expect(readBaseline('/dev/null/nope')).toBeUndefined();
  });
});

describe('compareRuns — the regression story between two runs', () => {
  const baseline = record('run_base', [
    { name: 'restock', passes: [true] },
    { name: 'write-off', passes: [false] },
    { name: 'checkout', passes: [true] },
  ]);

  it('a scenario passing any trial counts as passing the run, mirroring the gate', () => {
    const current = record('run_now', [
      { name: 'restock', passes: [false, true] },
      { name: 'write-off', passes: [true, false] },
      { name: 'checkout', passes: [false, false] },
    ]);

    expect(compareRuns(baseline, current)).toEqual({ improved: ['write-off'], regressed: ['checkout'] });
  });
});

describe('comparisonLines — what improved, what regressed, what it cost', () => {
  it('tells the whole story in plain lines', () => {
    const baseline = record('run_base', [{ name: 'checkout', passes: [true] }], 0.004);
    const current = record('run_now', [{ name: 'checkout', passes: [false] }], 0.005);
    const lines = comparisonLines(current, baseline);

    expect(lines.some((line) => line.includes('regressed: checkout'))).toBe(true);
    expect(lines.some((line) => line.includes('run_base'))).toBe(true);
    expect(lines.join('\n')).toContain('10 in / 2 out tokens');
    expect(lines.join('\n')).toContain('$0.005');
    expect(lines.join('\n')).toContain('baseline $0.004');
  });

  it('a first run has no baseline and says so', () => {
    const lines = comparisonLines(record('run_1', [{ name: 'restock', passes: [true] }], 0.002), undefined);

    expect(lines.some((line) => line.includes('no baseline'))).toBe(true);
    expect(lines.join('\n')).toContain('$0.002');
  });

  it('an unchanged run reports that, not silence', () => {
    const same = [{ name: 'restock', passes: [true] }];
    const lines = comparisonLines(record('run_2', same), record('run_1', same));

    expect(lines.some((line) => line.includes('no changes'))).toBe(true);
  });
});
