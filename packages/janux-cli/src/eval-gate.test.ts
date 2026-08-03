import { describe, expect, it } from 'bun:test';
import { gateFailures, verdictLines } from './eval-gate';
import type { ScenarioReport, StepReport } from './eval-runner';

const OUTCOME = { status: 200, ok: true };

function step(pass: boolean, label = 'api.stock.restock', detail?: string): StepReport {
  return { label, pass, detail, outcome: OUTCOME };
}

function scenario(name: string, pass: boolean, steps: StepReport[] = [step(pass)]): ScenarioReport {
  return { name, pass, steps };
}

describe('gateFailures — a regression fails every trial, a wobble does not', () => {
  it('one trial: a failing scenario fails the gate, naming the failing step', () => {
    const trial = [
      scenario('restock', true),
      scenario('write-off', false, [step(false, 'api.stock.discard', 'result mismatch, got {"executed":true}')]),
    ];

    expect(gateFailures([trial])).toEqual([
      { name: 'write-off', reason: 'failed in 1/1 trials — api.stock.discard: result mismatch, got {"executed":true}' },
    ]);
  });

  it('two trials: a scenario that fails only once stays informative, not blocking', () => {
    const flaky = [[scenario('checkout', false)], [scenario('checkout', true)]];

    expect(gateFailures(flaky)).toEqual([]);
  });

  it('two trials: failing both is a reproducible regression and blocks', () => {
    const red = [
      [scenario('checkout', false, [step(false, 'turn 0', 'expected ok true, got false')])],
      [scenario('checkout', false, [step(false, 'turn 0', 'expected ok true, got false')])],
    ];

    expect(gateFailures(red)).toEqual([
      { name: 'checkout', reason: 'failed in 2/2 trials — turn 0: expected ok true, got false' },
    ]);
  });

  it('an all-green run produces no failures', () => {
    expect(gateFailures([[scenario('restock', true)], [scenario('restock', true)]])).toEqual([]);
  });

  it('repeated scenario names gate independently by position', () => {
    const twice = [[scenario('write-off', true), scenario('write-off', false)]];

    expect(gateFailures([twice[0]!])).toHaveLength(1);
  });
});

describe('verdictLines — what the CI log and eval-gate.json say', () => {
  it('clean gate is a single reassuring line', () => {
    expect(verdictLines([])).toEqual(['eval gate: clean']);
  });

  it('failures list one line per regression, prefixed for scanning', () => {
    const failures = [{ name: 'checkout', reason: 'failed in 2/2 trials — turn 0: expected ok true, got false' }];

    expect(verdictLines(failures)).toEqual([
      'eval gate: 1 failure(s)',
      '  x checkout: failed in 2/2 trials — turn 0: expected ok true, got false',
    ]);
  });
});
