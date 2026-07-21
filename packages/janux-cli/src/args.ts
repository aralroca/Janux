export interface CliCommand {
  command: 'dev' | 'build' | 'start' | 'help';
  port: number;
  root: string;
}

const COMMANDS = new Set(['dev', 'build', 'start', 'help']);

export const HELP_TEXT = `janux — the agent-native fullstack UI framework

Usage:
  janux dev    [--port 3000]   Start the dev server (Vite + HMR)
  janux build                  Bundle client assets for production
  janux start  [--port 3000]   Run the production server (Bun)
`;

export function parseArgs(argv: string[], cwd: string): CliCommand {
  const command = COMMANDS.has(argv[0] ?? '') ? (argv[0] as CliCommand['command']) : 'help';
  const portFlag = argv.indexOf('--port');
  const port = portFlag >= 0 ? Number(argv[portFlag + 1]) : Number(process.env.PORT ?? 3000);

  if (Number.isNaN(port)) throw new Error('janux: --port must be a number');

  return { command, port, root: cwd };
}
