import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpAuthOptions, resolveAppConfig } from './app-config';

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

describe('resolveAppConfig src/ctx.ts', () => {
  it('picks up the ctx convention when the file exists', async () => {
    const root = app({ 'package.json': '{"name":"x"}' });

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/ctx.ts'), 'export default (req: Request) => ({ userId: null });');

    expect((await resolveAppConfig(root)).ctxModule).toBe(join(root, 'src/ctx.ts'));
  });

  it('leaves it undefined when the app has no ctx.ts (ctx stays {})', async () => {
    const root = app({ 'package.json': '{"name":"x"}' });

    expect((await resolveAppConfig(root)).ctxModule).toBeUndefined();
  });
});

describe('resolveAppConfig websocket module', () => {
  it('resolves src/ws.ts by convention', async () => {
    const root = app({});

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/ws.ts'), 'export default { path: "/ws" };');

    expect((await resolveAppConfig(root)).websocketModule).toBe(join(root, 'src/ws.ts'));
  });

  it('lets the config point somewhere else', async () => {
    const root = app({ 'janux.config.ts': `export default { websocket: 'src/live.ts' };` });

    expect((await resolveAppConfig(root)).websocketModule).toBe(join(root, 'src/live.ts'));
  });

  it('is undefined without the file', async () => {
    expect((await resolveAppConfig(app({}))).websocketModule).toBeUndefined();
  });
});

describe('resolveAppConfig mcpAuth and agents', () => {
  it('passes both through from the config file', async () => {
    const root = app({
      'janux.config.ts': `export default {
        mcpAuth: { token: 'demo', resourceMetadataUrl: 'https://x/meta' },
        agents: { webBotAuth: { keys: [] }, policy: 'require' },
      };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.mcpAuth).toEqual({ token: 'demo', resourceMetadataUrl: 'https://x/meta' });
    expect(config.agents).toEqual({ webBotAuth: { keys: [] }, policy: 'require' });
  });
});

describe('mcpAuthOptions', () => {
  it('maps a literal token to a bearer verifier', () => {
    const auth = mcpAuthOptions({ token: 'demo' })!;

    expect(auth.verify('demo', new Request('http://x'))).toBeTruthy();
    expect(auth.verify('wrong', new Request('http://x'))).toBeNull();
  });

  it('prefers the env var over the literal and remembers the metadata url', () => {
    process.env.JANUX_TEST_MCP_TOKEN = 'from-env';
    const auth = mcpAuthOptions({ tokenEnv: 'JANUX_TEST_MCP_TOKEN', token: 'demo', resourceMetadataUrl: 'https://x/meta' })!;

    expect(auth.verify('from-env', new Request('http://x'))).toBeTruthy();
    expect(auth.verify('demo', new Request('http://x'))).toBeNull();
    expect(auth.resourceMetadataUrl).toBe('https://x/meta');
    delete process.env.JANUX_TEST_MCP_TOKEN;
  });

  it('falls back to the literal when the env var is unset', () => {
    expect(mcpAuthOptions({ tokenEnv: 'JANUX_TEST_MCP_UNSET', token: 'demo' })!.verify('demo', new Request('http://x'))).toBeTruthy();
  });

  it('is off entirely when no protection was declared', () => {
    expect(mcpAuthOptions(undefined)).toBeUndefined();
    expect(mcpAuthOptions({})).toBeUndefined();
  });

  /**
   * Declaring `tokenEnv` states the endpoint is protected. Serving it open
   * because a secret is missing from the deploy inverts that intent silently —
   * every api() tool would answer any anonymous MCP client.
   */
  it('refuses to boot when the declared tokenEnv is missing, instead of failing open', () => {
    expect(() => mcpAuthOptions({ tokenEnv: 'JANUX_TEST_MCP_UNSET' })).toThrow(/JANUX_TEST_MCP_UNSET/);
  });
});

/**
 * The stylesheet entry used to be spelled `src/styles.css` and nothing else, so
 * a Sass app had no way to name its own entry: `janux build` bundled no styles
 * and the shell linked a sheet that was never emitted.
 */
describe('resolveAppConfig stylesheet', () => {
  function appWithStyles(name: string): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-styles-'));

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', name), 'body { color: red; }');

    return root;
  }

  it('resolves the plain CSS entry', async () => {
    const root = appWithStyles('styles.css');

    expect((await resolveAppConfig(root)).stylesheet).toBe(join(root, 'src/styles.css'));
  });

  it.each(['styles.scss', 'styles.sass', 'styles.less'])('resolves the %s entry', async (name) => {
    const root = appWithStyles(name);

    expect((await resolveAppConfig(root)).stylesheet).toBe(join(root, 'src', name));
  });

  it('prefers plain CSS when an app happens to have both', async () => {
    const root = appWithStyles('styles.css');

    writeFileSync(join(root, 'src', 'styles.scss'), '$c: red; body { color: $c; }');
    expect((await resolveAppConfig(root)).stylesheet).toBe(join(root, 'src/styles.css'));
  });

  it('leaves the stylesheet undefined when the app has none', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-styles-'));

    expect((await resolveAppConfig(root)).stylesheet).toBeUndefined();
  });
});

describe('the app root the framework publishes', () => {
  /**
   * An app's own modules locate their data files through `JANUX_APP_ROOT` — the
   * convention the Vercel adapter established because a bundle's
   * `import.meta.dirname` is not the app's. Every path that boots an app
   * resolves the config first, so this is where the promise is kept.
   */
  it('is set from the root being resolved', async () => {
    const root = app({ 'janux.config.ts': 'export default {};' });

    await resolveAppConfig(root);

    expect(process.env.JANUX_APP_ROOT).toBe(root);
  });
});
