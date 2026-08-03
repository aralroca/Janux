import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { testArgv, testCommand } from './test';

const command = (root: string, files: string[] = []) =>
  ({ command: 'test', root, files, port: 3000, url: '', json: false }) as any;

function appWith(tests: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-test-cmd-'));

  Object.entries(tests).forEach(([name, content]) => writeFileSync(join(root, name), content));

  return root;
}

/**
 * `testCommand` reports a failing suite the way `eval` and `verify` do — by
 * setting the runner's own exit code — so the test that proves it must put the
 * code back, or this file alone would fail the whole run.
 */
const previousExitCode = process.exitCode ?? 0;

afterEach(() => {
  process.exitCode = previousExitCode;
});

describe('janux test', () => {
  it('delegates to bun test rather than reinventing a runner', () => {
    expect(testArgv({ files: [] })).toEqual(['bun', 'test']);
    expect(testArgv({ files: ['src/cart.test.ts'] })).toEqual(['bun', 'test', 'src/cart.test.ts']);
  });

  it('runs the app suite from the app root and reports success', async () => {
    const root = appWith({ 'pass.test.ts': `import { expect, it } from 'bun:test';\nit('passes', () => expect(1).toBe(1));\n` });

    await testCommand(command(root));

    expect(process.exitCode ?? 0).toBe(0);
  });

  it('propagates a failing suite through the exit code', async () => {
    const root = appWith({ 'fail.test.ts': `import { expect, it } from 'bun:test';\nit('fails', () => expect(1).toBe(2));\n` });

    await testCommand(command(root));

    expect(process.exitCode).toBe(1);
  });
});
