import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bundlerPath } from './build';

describe('bundlerPath', () => {
  /**
   * The bundler is spawned as a sibling file, and what that sibling is called
   * depends on where the package is running from: `bundler.ts` in the workspace,
   * `bundler.js` once the package is compiled into `dist/`. Naming one of them
   * outright is a build that works here and breaks the moment it is published.
   */
  it('points at a file that exists next to this module', () => {
    const found = bundlerPath();

    expect(existsSync(found)).toBe(true);
    expect(found).toBe(join(import.meta.dirname, 'bundler.ts'));
  });

  it('accepts the compiled name too', () => {
    expect(bundlerPath((path) => path.endsWith('bundler.js'))).toBe(join(import.meta.dirname, 'bundler.js'));
  });

  it('says so when neither is there', () => {
    expect(() => bundlerPath(() => false)).toThrow(/bundler/);
  });
});
