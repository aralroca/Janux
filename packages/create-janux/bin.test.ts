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

  /** A flag that is not `--example` or `--template` is a typo, not a name to scaffold from. */
  test('refuses a flag it does not know', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--tempalte', 'blog'], { cwd });

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(cwd, 'my-app'))).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  test('scaffolds a product template with --template, rewriting workspace deps', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-ops', '--template', 'dashboard'], { cwd });

    expect(result.exitCode).toBe(0);
    const pkg = JSON.parse(readFileSync(join(cwd, 'my-ops', 'package.json'), 'utf-8'));

    expect(pkg.name).toBe('my-ops');
    expect(JSON.stringify(pkg)).not.toContain('workspace:*');
    expect(existsSync(join(cwd, 'my-ops', 'src/routes/index.tsx'))).toBe(true);
    expect(existsSync(join(cwd, 'my-ops', 'node_modules'))).toBe(false);
    expect(existsSync(join(cwd, 'my-ops', '.janux'))).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  /** A template starts a product: it must ship its own README and agent evals. */
  test.each(['dashboard', 'back-office', 'content-site'])('the %s template ships a README and evals', (template) => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--template', template], { cwd });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, 'my-app', 'README.md'))).toBe(true);
    expect(existsSync(join(cwd, 'my-app', 'evals'))).toBe(true);
    expect(readFileSync(join(cwd, 'my-app', 'README.md'), 'utf-8')).toContain('janux eval');
    rmSync(cwd, { recursive: true, force: true });
  });

  /**
   * `extends: "../../tsconfig.base.json"` resolves inside the monorepo and
   * nowhere else: scaffolded, it is a path to a file that is not there, and
   * Vite answers every request with a 500 instead of the app. Same class as
   * `workspace:*` deps — a monorepo-relative reference that cannot survive the
   * copy — so it is resolved by the same scaffolder, for templates and examples alike.
   */
  test.each([
    ['--template', 'dashboard'],
    ['--example', 'shop'],
  ])('%s %s scaffolds a tsconfig that resolves outside the monorepo', (flag, source) => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));

    expect(Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', flag, source], { cwd }).exitCode).toBe(0);
    const tsconfig = JSON.parse(readFileSync(join(cwd, 'my-app/tsconfig.json'), 'utf-8'));

    expect(tsconfig.extends).toBeUndefined();
    // Inlined, not dropped: the JSX runtime is what makes the app's own .tsx compile.
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('janux');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.include).toBeDefined();
    rmSync(cwd, { recursive: true, force: true });
  });

  /** The product wears YOUR name: the placeholder is stamped in sources too, not just the manifest. */
  test('a scaffolded template has no __APP_NAME__ placeholders anywhere', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'acme-ops', '--template', 'dashboard'], { cwd });

    expect(result.exitCode).toBe(0);
    const page = readFileSync(join(cwd, 'acme-ops', 'src/routes/index.tsx'), 'utf-8');

    expect(page).not.toContain('__APP_NAME__');
    expect(page).toContain('acme-ops');
    rmSync(cwd, { recursive: true, force: true });
  });

  test('unknown template fails listing the available ones', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--template', 'nope'], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('dashboard');
    expect(existsSync(join(cwd, 'my-app'))).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  /** Bare `--template` lists the gallery and reads the pick from stdin. */
  test('--template with no name is an interactive pick', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--template'], {
      cwd,
      stdin: Buffer.from('3\n'),
    });

    expect(result.exitCode).toBe(0);
    // Listed sorted, with a one-line pitch each: back-office, content-site, dashboard.
    for (const template of ['back-office', 'content-site', 'dashboard']) {
      expect(result.stdout.toString()).toContain(template);
    }
    expect(readFileSync(join(cwd, 'my-app', 'README.md'), 'utf-8')).toContain('dashboard');
    rmSync(cwd, { recursive: true, force: true });
  });

  test('--template with no name and no input fails listing the available ones', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'my-app', '--template'], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('content-site');
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
