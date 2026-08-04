import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { childStdio, scenarioFiles } from './eval';
import type { CliCommand } from './args';

const ROOT = join(import.meta.dir, '__fixtures__', 'eval-app');

function cli(over: Partial<CliCommand> = {}): CliCommand {
  return {
    command: 'eval',
    port: 3000,
    root: ROOT,
    files: [],
    url: 'http://localhost:3000',
    json: false,
    trials: 1,
    dryRun: false,
    list: false,
    ...over,
  };
}

describe('scenarioFiles', () => {
  it('globs evals/**/*.eval.json in deterministic sorted order', () => {
    expect(scenarioFiles(cli())).toEqual([
      join(ROOT, 'evals/a-first.eval.json'),
      join(ROOT, 'evals/b-second.eval.json'),
      join(ROOT, 'evals/nested/c-third.eval.json'),
    ]);
  });

  it('resolves explicit files against the root instead of globbing', () => {
    expect(scenarioFiles(cli({ files: ['other/x.eval.json'] }))).toEqual([join(ROOT, 'other/x.eval.json')]);
  });
});

describe('childStdio', () => {
  it('silences the child app stdout/stdin under --json so the report owns stdout', () => {
    expect(childStdio(cli({ json: true }))).toEqual(['ignore', 'ignore', 'inherit']);
  });

  it('inherits stdio for the human report', () => {
    expect(childStdio(cli())).toBe('inherit');
  });
});
