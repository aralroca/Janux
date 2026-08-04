import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from './args';
import { codemodCommand, installedJanuxVersion, upgrade } from './upgrade';

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-upgrade-'));

  for (const [path, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), code);
  }

  return root;
}

/** The command line as a user types it, resolved against a throwaway app. */
function command(argv: string[], root: string) {
  return { ...parseArgs(argv, root), root };
}

/** What the command printed — these commands report to the terminal, so that is the surface under test. */
async function output(run: () => Promise<void> | void): Promise<string> {
  const written: string[] = [];
  const log = console.log;

  console.log = (...parts: unknown[]) => written.push(parts.join(' '));
  try {
    await run();
  } finally {
    console.log = log;
  }

  return written.join('\n');
}

const WIDGET = 'const a = <button on={intents.add} />;\n';

describe('installedJanuxVersion', () => {
  it('reads the version off the app own dependency', () => {
    const root = app({ 'node_modules/janux/package.json': '{"name":"janux","version":"0.4.0"}' });

    expect(installedJanuxVersion(root)).toBe('0.4.0');
  });

  it('answers nothing when Janux is not installed, rather than guessing a version', () => {
    expect(installedJanuxVersion(app({ 'src/a.tsx': '' }))).toBeUndefined();
  });
});

describe('janux upgrade', () => {
  it('runs the codemod for a release the upgrade crosses', async () => {
    const root = app({ 'src/W.tsx': WIDGET });

    await upgrade(command(['upgrade', '--from', '0.4.0', '--to', '0.6.0'], root));
    expect(readFileSync(join(root, 'src/W.tsx'), 'utf8')).toBe('const a = <button onClick={intents.add} />;\n');
  });

  it('writes nothing under --dry-run, and prints the diff it would have written', async () => {
    const root = app({ 'src/W.tsx': WIDGET });
    const printed = await output(() => upgrade(command(['upgrade', '--from', '0.4.0', '--to', '0.6.0', '--dry-run'], root)));

    expect(readFileSync(join(root, 'src/W.tsx'), 'utf8')).toBe(WIDGET);
    expect(printed).toContain('-const a = <button on={intents.add} />;');
    expect(printed).toContain('+const a = <button onClick={intents.add} />;');
  });

  it('takes the version to upgrade from off the installed Janux when it is not given', async () => {
    const root = app({ 'src/W.tsx': WIDGET, 'node_modules/janux/package.json': '{"name":"janux","version":"0.4.0"}' });

    await upgrade(command(['upgrade', '--to', '0.6.0'], root));
    expect(readFileSync(join(root, 'src/W.tsx'), 'utf8')).toContain('onClick');
  });

  it('says there is nothing to do when no breaking change lies between the two versions', async () => {
    const root = app({ 'src/W.tsx': WIDGET });
    const printed = await output(() => upgrade(command(['upgrade', '--from', '0.5.0', '--to', '0.6.0'], root)));

    expect(printed).toMatch(/no codemod|nothing/i);
    expect(readFileSync(join(root, 'src/W.tsx'), 'utf8')).toBe(WIDGET);
  });

  it('asks for --from rather than guessing when Janux is not installed', async () => {
    const printed = await output(() => upgrade(command(['upgrade', '--to', '0.6.0'], app({ 'src/W.tsx': WIDGET }))));

    expect(printed).toContain('--from');
  });

  it('is idempotent: a second run finds nothing left to do', async () => {
    const root = app({ 'src/W.tsx': WIDGET });
    const line = ['upgrade', '--from', '0.4.0', '--to', '0.6.0'];

    await upgrade(command(line, root));
    const printed = await output(() => upgrade(command(line, root)));

    expect(printed).toContain('Nothing to do.');
  });
});

describe('janux codemod', () => {
  it('lists the catalog with --list', async () => {
    const printed = await output(() => codemodCommand(command(['codemod', '--list'], app({}))));

    expect(printed).toContain('next/routes');
    expect(printed).toContain('0.5.0/events-by-name');
  });

  it('runs one migration codemod by id', async () => {
    const root = app({ 'app/page.tsx': 'export default function P() {}\n' });

    await codemodCommand(command(['codemod', 'next/routes'], root));
    expect(readFileSync(join(root, 'src/routes/index.tsx'), 'utf8')).toBe('export default function P() {}\n');
  });

  it('offers --dry-run for a migration codemod too', async () => {
    const root = app({ 'app/page.tsx': 'export default function P() {}\n' });
    const printed = await output(() => codemodCommand(command(['codemod', 'next/routes', '--dry-run'], root)));

    expect(printed).toContain('app/page.tsx → src/routes/index.tsx');
    expect(readFileSync(join(root, 'app/page.tsx'), 'utf8')).toBe('export default function P() {}\n');
  });

  it('names the catalog when asked for a codemod that does not exist', async () => {
    const printed = await output(() => codemodCommand(command(['codemod', 'nope/nope'], app({}))));

    expect(printed).toContain('nope/nope');
    expect(printed).toContain('next/metadata');
  });

  it('asks for an id when given none', async () => {
    expect(await output(() => codemodCommand(command(['codemod'], app({}))))).toMatch(/--list/);
  });
});
