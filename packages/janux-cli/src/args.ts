export interface CliCommand {
  command: 'dev' | 'build' | 'start' | 'test' | 'run' | 'verify' | 'eval' | 'info' | 'help';
  port: number;
  root: string;
  files: string[];
  url: string;
  startCommand?: string;
  json: boolean;
  /** How many times `eval` runs the whole scenario set; the gate blocks only on all-trials failures. */
  trials: number;
  /** Run record (JSON) to compare this eval run against, instead of the local history. */
  baseline?: string;
}

const COMMANDS = new Set(['dev', 'build', 'start', 'test', 'run', 'verify', 'eval', 'info', 'help']);
const VALUE_FLAGS = new Set(['--port', '--url', '--start', '--trials', '--baseline']);

export const HELP_TEXT = `janux — the fullstack framework for the Agentic Web

Usage:
  janux dev    [--port 3000]   Start the dev server (Vite + HMR)
  janux build                  Bundle client assets for production
  janux start  [--port 3000]   Run the production server (Bun)
  janux test   [files...]      Run the app's suite with bun test — flags pass through (--watch, --coverage)
  janux run    [tool] [--arg]  Invoke an intent or an api() from the terminal (no tool: list them)
  janux verify                 Check the agent surface (tool contracts)
  janux eval   [files...]      Run agent-task scenarios (evals/**/*.eval.json)
               [--url http://localhost:3000] [--start "janux start"] [--json]
               [--trials 2] [--baseline evals/baseline.json]
  janux info                   Versions, resolved config and routes, as markdown to paste into an issue
`;

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  return index >= 0 ? argv[index + 1] : undefined;
}

function positionals(argv: string[]): string[] {
  return argv
    .slice(1)
    .filter((arg, index, all) => !arg.startsWith('--') && !VALUE_FLAGS.has(all[index - 1] ?? ''));
}

/** The TCP range, so a port that cannot be listened on is refused by the flag that named it. */
const MAX_PORT = 65535;

export function parseArgs(argv: string[], cwd: string): CliCommand {
  const command = COMMANDS.has(argv[0] ?? '') ? (argv[0] as CliCommand['command']) : 'help';
  const port = Number(flagValue(argv, '--port') ?? process.env.PORT ?? 3000);
  const trials = Number(flagValue(argv, '--trials') ?? 1);

  // Checked here rather than left to the runtime: `Bun.serve` and
  // `server.listen` both reject a fraction, a negative number and anything past
  // the TCP range — from inside the server, with a message about sockets rather
  // than about the flag that was typed. `NaN` fails every one of these.
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) {
    throw new Error(`janux: --port must be a whole number between 0 and ${MAX_PORT}`);
  }
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error('janux: --trials must be a whole number of runs, at least 1');
  }

  return {
    command,
    port,
    root: cwd,
    files: positionals(argv),
    url: flagValue(argv, '--url') ?? 'http://localhost:3000',
    startCommand: flagValue(argv, '--start'),
    json: argv.includes('--json'),
    trials,
    baseline: flagValue(argv, '--baseline'),
  };
}
