import type { CliCommand } from './args';

/** The argv `janux test` hands to Bun — `bun:test` IS the runner, this is the front door. */
export function testArgv(passthrough: string[]): string[] {
  return ['bun', 'test', ...passthrough];
}

/**
 * Runs the app's suite with `bun test` from the app root.
 *
 * Everything after the command name goes through verbatim, flags included: a
 * front door that quietly dropped `--watch` or `--coverage` would be worse than
 * no front door. The exit code is the suite's, which is what CI reads.
 */
export async function testCommand(parsed: CliCommand, passthrough: string[]): Promise<void> {
  const child = Bun.spawn(testArgv(passthrough), { cwd: parsed.root, stdout: 'inherit', stderr: 'inherit' });
  const code = await child.exited;

  if (code !== 0) process.exitCode = code;
}
