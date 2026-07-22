import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from './app-config';

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-app-'));

  Object.entries(files).forEach(([name, content]) => writeFileSync(join(root, name), content));

  return root;
}

function appWithPackageJson(json: unknown): string {
  return app({ 'package.json': JSON.stringify(json) });
}

describe('resolveAppConfig janux.config.ts', () => {
  it('reads options from the config file default export', async () => {
    const root = app({ 'janux.config.ts': `export default { title: 'My App', llmsTxt: { description: 'An app.' } };` });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('My App');
    expect(config.llmsTxt).toEqual({ description: 'An app.' });
  });

  it('wins over the deprecated package.json "janux" field', async () => {
    const root = app({
      'package.json': JSON.stringify({ name: 'x', janux: { title: 'From pkg', output: 'static' } }),
      'janux.config.ts': `export default { title: 'From file' };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('From file');
    expect(config.output).toBe('static');
  });

  it('lets explicit plugin options win over the config file', async () => {
    const root = app({ 'janux.config.ts': `export default { title: 'From file' };` });

    expect((await resolveAppConfig(root, { title: 'From plugin' })).title).toBe('From plugin');
  });
});

describe('resolveAppConfig package.json "janux" field (deprecated fallback)', () => {
  it('reads llmsTxt and title from the app package.json', async () => {
    const root = appWithPackageJson({
      name: 'x',
      janux: { title: 'My App', llmsTxt: { description: 'An app.' } },
    });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('My App');
    expect(config.llmsTxt).toEqual({ description: 'An app.' });
  });

  it('defaults output to "bun" and reads "static" from the config', async () => {
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x' }))).output).toBe('bun');
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x', janux: { output: 'static' } }))).output).toBe('static');
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x' }), { output: 'static' })).output).toBe('static');
  });

  it('tolerates apps without a package.json or without the field', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-app-'));

    expect((await resolveAppConfig(root)).llmsTxt).toBeUndefined();
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x' }))).llmsTxt).toBeUndefined();
  });
});
