import { HELP_TEXT, parseArgs } from './args';
import { build, dev, start } from './commands';
import { verify } from './verify';
import { evalCommand } from './eval';

export { parseArgs, HELP_TEXT } from './args';

export async function runCli(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv, process.cwd());

  if (parsed.command === 'dev') return dev(parsed);
  if (parsed.command === 'build') return build(parsed);
  if (parsed.command === 'start') return start(parsed);
  if (parsed.command === 'verify') return verify(parsed);
  if (parsed.command === 'eval') return evalCommand(parsed);
  console.log(HELP_TEXT);
}
