import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  test('rejects a non-kebab-case name', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'create-janux-'));
    const result = Bun.spawnSync(['bun', join(import.meta.dirname, 'bin.ts'), 'My App'], { cwd });

    expect(result.exitCode).toBe(1);
    rmSync(cwd, { recursive: true, force: true });
  });
});
