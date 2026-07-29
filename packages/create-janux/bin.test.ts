import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  test('rejects a non-kebab-case name', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'My App'], { cwd });

    expect(result.exitCode).toBe(1);
    rmSync(cwd, { recursive: true, force: true });
  });
});
