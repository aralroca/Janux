import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from './app-config';

function appWithPackageJson(json: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-app-'));

  writeFileSync(join(root, 'package.json'), JSON.stringify(json));

  return root;
}

describe('resolveAppConfig package.json "janux" field', () => {
  it('reads llmsTxt and title from the app package.json', () => {
    const root = appWithPackageJson({
      name: 'x',
      janux: { title: 'My App', llmsTxt: { description: 'An app.' } },
    });
    const app = resolveAppConfig(root);

    expect(app.title).toBe('My App');
    expect(app.llmsTxt).toEqual({ description: 'An app.' });
  });

  it('lets explicit plugin options win over package.json', () => {
    const root = appWithPackageJson({ name: 'x', janux: { title: 'From pkg' } });

    expect(resolveAppConfig(root, { title: 'From plugin' }).title).toBe('From plugin');
  });

  it('defaults output to "bun" and reads "static" from the config', () => {
    expect(resolveAppConfig(appWithPackageJson({ name: 'x' })).output).toBe('bun');
    expect(resolveAppConfig(appWithPackageJson({ name: 'x', janux: { output: 'static' } })).output).toBe('static');
    expect(resolveAppConfig(appWithPackageJson({ name: 'x' }), { output: 'static' }).output).toBe('static');
  });

  it('tolerates apps without a package.json or without the field', () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-app-'));

    expect(resolveAppConfig(root).llmsTxt).toBeUndefined();
    expect(resolveAppConfig(appWithPackageJson({ name: 'x' })).llmsTxt).toBeUndefined();
  });
});
