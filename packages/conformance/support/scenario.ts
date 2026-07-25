import { expect, it } from 'bun:test';
import type { Case } from './case';

/**
 * A scripted scenario whose observable log *is* the assertion.
 *
 * Most framework bugs are about ordering and how many times something ran, not
 * about a single return value — so the corpus encodes them as a script plus the
 * exact event sequence it must produce. Errors are logged deliberately
 * (`log.push('threw: ...')`), never swallowed.
 */
export interface Scenario {
  run: (log: string[]) => void | Promise<void>;
  expected: string[];
}

export type ScenarioCase = Case<Scenario>;

/**
 * One test per row, named by its id.
 *
 * Every corpus runner goes through here so the "test name is the case id"
 * convention holds in one place — `scripts/test-census.ts` groups by it and
 * `no-duplicate-cases.test.ts` enforces its shape.
 */
export function runCases<T>(table: Case<T>[], check: (row: Case<T>) => void | Promise<void>): void {
  it.each(table.map((row) => [row.id, row] as const))('%s', (_id, row) => check(row));
}

export function runScenarios(table: ScenarioCase[]): void {
  runCases(table, async (row) => {
    const log: string[] = [];

    await row.run(log);

    expect(log).toEqual(row.expected);
  });
}

/**
 * Records what a throwing call did, so "throws clearly" is an assertable event.
 *
 * Handles a rejected promise as well as a synchronous throw, and returns one when
 * `fn` does — an `await`-less version reported `ok` before the rejection landed,
 * which made every async "must throw" case pass without asserting anything.
 * `await attempt(...)` is therefore required for an async `fn`.
 */
export function attempt(log: string[], label: string, fn: () => unknown): void | Promise<void> {
  try {
    const result = fn();

    if (result instanceof Promise) return result.then(() => record(log, label), (error) => record(log, label, error));
    record(log, label);
  } catch (error) {
    record(log, label, error);
  }
}

function record(log: string[], label: string, error?: unknown): void {
  log.push(error === undefined ? `${label}:ok` : `${label}:threw:${(error as Error).message}`);
}
