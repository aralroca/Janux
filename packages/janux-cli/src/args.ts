export interface CliCommand {
  command: 'dev' | 'build' | 'start' | 'verify' | 'eval' | 'info' | 'help';
  port: number;
  root: string;
  files: string[];
  url: string;
  startCommand?: string;
  json: boolean;
}

const COMMANDS = new Set(['dev', 'build', 'start', 'verify', 'eval', 'info', 'help']);
const VALUE_FLAGS = new Set(['--port', '--url', '--start']);

export const HELP_TEXT = `janux — the fullstack framework for the Agentic Web

Usage:
  janux dev    [--port 3000]   Start the dev server (Vite + HMR)
  janux build                  Bundle client assets for production
  janux start  [--port 3000]   Run the production server (Bun)
  janux verify                 Check the agent surface (tool contracts)
  janux eval   [files...]      Run agent-task scenarios (evals/**/*.eval.json)
               [--url http://localhost:3000] [--start "janux start"] [--json]
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

export function parseArgs(argv: string[], cwd: string): CliCommand {
  const command = COMMANDS.has(argv[0] ?? '') ? (argv[0] as CliCommand['command']) : 'help';
  const port = Number(flagValue(argv, '--port') ?? process.env.PORT ?? 3000);

  if (Number.isNaN(port)) throw new Error('janux: --port must be a number');

  return {
    command,
    port,
    root: cwd,
    files: positionals(argv),
    url: flagValue(argv, '--url') ?? 'http://localhost:3000',
    startCommand: flagValue(argv, '--start'),
    json: argv.includes('--json'),
  };
}
