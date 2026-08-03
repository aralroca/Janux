import type { CliCommand } from './args';

/** The argv `janux test` hands to Bun — `bun:test` IS the runner, this is the front door. */
export function testArgv(parsed: Pick<CliCommand, 'files'>): string[] {
  return ['bun', 'test', ...parsed.files];
}

/**
 * Runs the app's suite with `bun test` from the app root, file filters passed
 * through verbatim. The exit code is the suite's — CI reads it, so a failing
 * test fails the command.
 */
export async function testCommand(parsed: CliCommand): Promise<void> {
  const child = Bun.spawn(testArgv(parsed), { cwd: parsed.root, stdout: 'inherit', stderr: 'inherit' });
  const code = await child.exited;

  if (code !== 0) process.exitCode = code;
}
