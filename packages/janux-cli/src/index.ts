import { HELP_TEXT, parseArgs } from './args';
import { build, dev, start } from './commands';
import { testCommand } from './test';
import { verify } from './verify';
import { evalCommand } from './eval';
import { info } from './info';
import { codemodCommand, upgrade } from './upgrade';

export { parseArgs, HELP_TEXT } from './args';
/** The ServerOptions `janux start` builds from an app's conventions — for custom servers. */
export { prodServerOptions } from './prod';
/** Static-asset resolution for a built `dist/client` — what `janux start` serves before the app. */
export { staticResponse } from './static-assets';

export async function runCli(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv, process.cwd());

  if (parsed.command === 'dev') return dev(parsed);
  if (parsed.command === 'build') return build(parsed);
  if (parsed.command === 'start') return start(parsed);
  if (parsed.command === 'test') return testCommand(parsed, argv.slice(1));
  if (parsed.command === 'verify') return verify(parsed);
  if (parsed.command === 'eval') return evalCommand(parsed);
  if (parsed.command === 'info') return info(parsed);
  if (parsed.command === 'upgrade') return upgrade(parsed);
  if (parsed.command === 'codemod') return codemodCommand(parsed);
  console.log(HELP_TEXT);
}
