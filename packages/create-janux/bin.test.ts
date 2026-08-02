import { describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('create-janux', () => {
  test('scaffolds an app with no __APP_NAME__ placeholders left', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app'], { cwd });

    expect(result.exitCode).toBe(0);

    for (const file of ['package.json', 'README.md']) {
      const content = readFileSync(join(cwd, 'my-app', file), 'utf-8');

      expect(content).not.toContain('__APP_NAME__');
      expect(content).toContain('my-app');
    }
    // A new app answers a bad URL and a broken render with its own pages, not with bare text.
    expect(existsSync(join(cwd, 'my-app', 'src/routes/_404.tsx'))).toBe(true);
    expect(existsSync(join(cwd, 'my-app', 'src/routes/_500.tsx'))).toBe(true);
    rmSync(cwd, { recursive: true, force: true });
  });

  test('scaffolds from an example with --example, rewriting workspace deps', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-shop', '--example', 'i18n'], { cwd });

    expect(result.exitCode).toBe(0);
    const pkg = JSON.parse(readFileSync(join(cwd, 'my-shop', 'package.json'), 'utf-8'));

    expect(pkg.name).toBe('my-shop');
    expect(JSON.stringify(pkg)).not.toContain('workspace:*');
    expect(existsSync(join(cwd, 'my-shop', 'src/routes/index.tsx'))).toBe(true);
    expect(existsSync(join(cwd, 'my-shop', 'dist'))).toBe(false);
    expect(existsSync(join(cwd, 'my-shop', 'node_modules'))).toBe(false);
    expect(existsSync(join(cwd, 'my-shop', '.janux'))).toBe(false);
    // The closing hint must advertise the port the copied dev script pins.
    expect(result.stdout.toString()).toContain('localhost:4321/_janux/manifest');
    rmSync(cwd, { recursive: true, force: true });
  });

  test.each(['with-forms', 'realtime-chat', 'with-mcp-url'])('scaffolds the %s example cleanly', (example) => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--example', example], { cwd });

    expect(result.exitCode).toBe(0);
    const pkg = JSON.parse(readFileSync(join(cwd, 'my-app', 'package.json'), 'utf-8'));

    expect(pkg.name).toBe('my-app');
    expect(JSON.stringify(pkg)).not.toContain('workspace:*');
    expect(existsSync(join(cwd, 'my-app', 'src/routes'))).toBe(true);
    expect(existsSync(join(cwd, 'my-app', 'README.md'))).toBe(true);
    expect(existsSync(join(cwd, 'my-app', '.janux'))).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  test('unknown example fails listing the available ones', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-shop', '--example', 'nope'], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('shop');
    rmSync(cwd, { recursive: true, force: true });
  });

  // Published, the bin is `dist/bin.js` and its assets are one level up. Running
  // a copy from a subdirectory is what that looks like from the bin's side.
  test('finds its template and version from a compiled bin one level down', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const compiled = join(import.meta.dirname, 'dist/bin.ts');

    cpSync(join(import.meta.dirname, 'bin.ts'), compiled, { recursive: true });
    const result = Bun.spawnSync(['bun', compiled, 'my-app'], { cwd });

    rmSync(compiled, { force: true });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, 'my-app', 'package.json'))).toBe(true);
    expect(readFileSync(join(cwd, 'my-app', 'package.json'), 'utf-8')).not.toContain('workspace:*');
    rmSync(cwd, { recursive: true, force: true });
  });

  test('rejects a non-kebab-case name', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'My App'], { cwd });

    expect(result.exitCode).toBe(1);
    rmSync(cwd, { recursive: true, force: true });
  });

  /** Scaffolding into a directory that exists would merge into somebody's work. */
  test('refuses to write into a directory that is already there', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));

    mkdirSync(join(cwd, 'my-app'));
    writeFileSync(join(cwd, 'my-app/keep.txt'), 'mine');
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app'], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('already exists');
    expect(readFileSync(join(cwd, 'my-app/keep.txt'), 'utf-8')).toBe('mine');
    expect(existsSync(join(cwd, 'my-app/package.json'))).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  test('prints the usage line when it is given no name at all', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts')], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Usage: create-janux');
    rmSync(cwd, { recursive: true, force: true });
  });

  /** A flag that is not `--example` is a typo, not a name to scaffold from. */
  test('refuses a flag it does not know', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--template', 'blog'], { cwd });

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(cwd, 'my-app'))).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  /** The template is a working app, not a snippet: what it declares has to exist. */
  test('scaffolds a template whose entry points are all there', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));

    expect(Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app'], { cwd }).exitCode).toBe(0);
    const pkg = JSON.parse(readFileSync(join(cwd, 'my-app/package.json'), 'utf-8'));

    expect(Object.keys(pkg.scripts)).toContain('dev');
    expect(existsSync(join(cwd, 'my-app/src/routes/index.tsx'))).toBe(true);
    expect(existsSync(join(cwd, 'my-app/src/client.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'my-app/tsconfig.json'))).toBe(true);
    rmSync(cwd, { recursive: true, force: true });
  });
});
