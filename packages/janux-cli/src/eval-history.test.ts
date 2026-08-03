import { describe, expect, it } from 'bun:test';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendHistory,
  buildRecord,
  compareRuns,
  comparisonLines,
  readBaseline,
  HISTORY_FILE,
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

  /**
   * `defineAgent({ model })` wins over JANUX_MODEL inside the app, so the env
   * var the runner can see is a guess. The turn envelope reports what actually
   * answered — and a baseline whose `model` is fabricated cannot be compared.
   */
  it('records the model the agent actually answered with, over the env guess', () => {
    const answered: ScenarioReport = {
      name: 'restock',
      pass: true,
      steps: [
        { label: 'turn "hi"', pass: true, outcome: { status: 200, ok: true, result: { type: 'text', model: 'anthropic/claude-sonnet-5' } } },
      ],
    };

    expect(buildRecord([[answered]], { ...META, model: 'openrouter/google/gemini-2.5-flash-lite' }).model).toBe(
      'anthropic/claude-sonnet-5',
    );
    expect(buildRecord([[scenario('restock', true)]], META).model).toBe(META.model);
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

  // A file standing where the directory should be, rather than a path that is
  // only unusable on POSIX: `/dev/null/nope` is a plain missing path on Windows,
  // where the write then succeeds and there is nothing to fail open from.
  it('never throws: an unwritable root loses the record, not the run', () => {
    const blocked = join(mkdtempSync(join(tmpdir(), 'janux-history-')), 'not-a-dir');

    writeFileSync(blocked, '');

    expect(() => appendHistory(blocked, record('run_1', []))).not.toThrow();
    expect(readBaseline(blocked)).toBeUndefined();
  });

  /**
   * A baseline was asked for by name: guessing wrong must say so. Silence would
   * let a renamed baseline stop comparing while CI stayed green, and a crash
   * would fail an all-passing run over a typo.
   */
  it('an explicit baseline that is missing or not a run record is a named error', () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-evals-'));
    const notARecord = join(root, 'eval-gate.json');

    writeFileSync(notARecord, JSON.stringify({ failures: [] }));

    expect(() => readBaseline(root, join(root, 'typo.json'))).toThrow(/--baseline/);
    expect(() => readBaseline(root, notARecord)).toThrow(/run record/);
  });

  it('a corrupt local history line is ignored, not fatal — it is a cache, not a source of truth', () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-evals-'));

    appendHistory(root, record('run_1', [{ name: 'restock', passes: [true] }]));
    appendFileSync(join(root, HISTORY_FILE), '{ truncated…\n');

    expect(readBaseline(root)).toBeUndefined();
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

  /**
   * The recipe tells nightly runs to use --trials 3 while a committed baseline
   * is a --trials 1 green run. Comparing the raw totals would print a permanent
   * 3x "cost regression" that no code change could ever clear.
   */
  it('compares cost per trial, so a run with more trials is not a phantom regression', () => {
    const baseline = { ...record('run_base', [{ name: 'checkout', passes: [true] }], 0.002), trials: 1 };
    const current = { ...record('run_now', [{ name: 'checkout', passes: [true, true, true] }], 0.006), trials: 3 };
    const lines = comparisonLines(current, baseline).join('\n');

    // Spent $0.006 across 3 trials — the same $0.002 per trial as the baseline.
    expect(lines).toContain('$0.006');
    expect(lines).toContain('baseline $0.002 per trial');
    expect(lines).not.toContain('baseline $0.006');
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
